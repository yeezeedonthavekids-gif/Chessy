//go:build windows

package main

import (
	"os"
	"syscall"
	"unsafe"
)

// fail shows a message box, since the Windows build has no console window.
func fail(msg string) {
	user32 := syscall.NewLazyDLL("user32.dll")
	box := user32.NewProc("MessageBoxW")
	text, _ := syscall.UTF16PtrFromString(msg)
	title, _ := syscall.UTF16PtrFromString("FileShift")
	box.Call(0, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), 0x10)
	os.Exit(1)
}
