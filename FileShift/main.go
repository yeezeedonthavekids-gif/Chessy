// FileShift serves its bundled converter UI on localhost and opens it in the
// default browser. Every conversion runs in the browser; nothing is uploaded.
// The process exits shortly after the last FileShift tab is closed.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"sync"
	"time"
)

//go:embed web
var webFS embed.FS

const (
	preferredAddr = "127.0.0.1:47821"
	idleTimeout   = 20 * time.Second // after the last heartbeat
	startupGrace  = 2 * time.Minute  // before the first heartbeat
)

func main() {
	ln, err := net.Listen("tcp", preferredAddr)
	if err != nil {
		// Another FileShift is probably running: reuse it.
		if isFileShift("http://" + preferredAddr) {
			openBrowser("http://" + preferredAddr + "/")
			return
		}
		if ln, err = net.Listen("tcp", "127.0.0.1:0"); err != nil {
			fail("FileShift could not start a local server: " + err.Error())
		}
	}
	url := "http://" + ln.Addr().String() + "/"

	var mu sync.Mutex
	lastBeat := time.Time{}
	started := time.Now()

	sub, _ := fs.Sub(webFS, "web")
	mux := http.NewServeMux()
	files := http.FileServer(http.FS(sub))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		files.ServeHTTP(w, r)
	}))
	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		lastBeat = time.Now()
		mu.Unlock()
		w.Header().Set("Cache-Control", "no-store")
		fmt.Fprint(w, "fileshift")
	})

	go func() {
		for range time.Tick(2 * time.Second) {
			mu.Lock()
			lb := lastBeat
			mu.Unlock()
			if (lb.IsZero() && time.Since(started) > startupGrace) || (!lb.IsZero() && time.Since(lb) > idleTimeout) {
				os.Exit(0)
			}
		}
	}()

	fmt.Println("FileShift is running at " + url)
	fmt.Println("It closes by itself when you close the browser tab.")
	go openBrowser(url)
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	if err := srv.Serve(ln); err != nil {
		fail("FileShift stopped: " + err.Error())
	}
}

func isFileShift(base string) bool {
	c := http.Client{Timeout: 2 * time.Second}
	resp, err := c.Post(base+"/api/ping", "text/plain", nil)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	buf := make([]byte, 9)
	n, _ := resp.Body.Read(buf)
	return string(buf[:n]) == "fileshift"
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		fmt.Println("Open this address in your browser: " + url)
	}
}
