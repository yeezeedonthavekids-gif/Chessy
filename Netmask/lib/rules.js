// Detection rules. Each rule can match on:
//   strings  - regex tested against every string literal (and decoded base64 / char-array strings)
//   methods  - exact "owner/Class.method" references in the constant pool
//   classes  - exact class references
//   files    - regex tested against entry paths inside the jar
// Weights: critical 40, high 20, medium 8, low 2.

const W = { critical: 40, high: 20, medium: 8, low: 2 };

const rules = [
  // ---- Exfiltration endpoints -------------------------------------------
  {
    id: 'discord-webhook', severity: 'critical', category: 'Exfiltration',
    title: 'Discord webhook URL',
    why: 'Webhooks are the #1 way Minecraft ratters send stolen tokens and sessions out.',
    strings: [/discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+/i, /\/api\/webhooks\//i],
  },
  {
    id: 'telegram-bot', severity: 'critical', category: 'Exfiltration',
    title: 'Telegram bot API',
    why: 'Telegram bots are commonly used to receive stolen data.',
    strings: [/api\.telegram\.org\/bot/i],
  },
  {
    id: 'paste-hosts', severity: 'medium', category: 'Exfiltration',
    title: 'Paste / file-drop host',
    why: 'Paste sites and anonymous file hosts are used to fetch payloads or upload logs.',
    strings: [/pastebin\.com|hastebin|paste\.ee|rentry\.co|anonfiles|gofile\.io|transfer\.sh|file\.io|catbox\.moe|termbin/i],
  },
  {
    id: 'tunnels', severity: 'high', category: 'Exfiltration',
    title: 'Tunnel / dynamic DNS host',
    why: 'ngrok, duckdns etc. let attackers hide a home C2 server behind a public name.',
    strings: [/ngrok\.(io|app)|\.duckdns\.org|no-ip\.|\.ddns\.net|playit\.gg|serveo\.net|localtonet|portmap\.io/i],
  },
  {
    id: 'ip-lookup', severity: 'medium', category: 'Recon',
    title: 'Public IP lookup',
    why: 'Grabbing your public IP is typical for loggers. Some legit mods do it too.',
    strings: [/api\.ipify\.org|ip-api\.com|ipinfo\.io|checkip\.amazonaws|icanhazip|myexternalip|wtfismyip/i],
  },
  {
    id: 'raw-ip-url', severity: 'medium', category: 'Exfiltration',
    title: 'Hard-coded IP address URL',
    why: 'Talking to a raw IP instead of a domain is a common C2 pattern.',
    strings: [/https?:\/\/(\d{1,3}\.){3}\d{1,3}(:\d+)?/],
  },

  // ---- Credential theft --------------------------------------------------
  {
    id: 'mc-session', severity: 'critical', category: 'Account theft',
    title: 'Reads the Minecraft session / access token',
    why: 'A mod has almost no reason to read your access token. This is how session stealers work.',
    strings: [/\bgetAccessToken\b|\bgetSessionID\b|\bfunc_111286_b\b|\bfield_148258_c\b|\bmethod_1674\b|\bmethod_1675\b/],
    methods: [/\.getAccessToken$/, /\.getSessionID$/, /\.func_111286_b$/, /\.method_1674$/, /\.method_1675$/],
  },
  {
    id: 'launcher-accounts', severity: 'critical', category: 'Account theft',
    title: 'Reads launcher account files',
    why: 'These files hold Microsoft / Minecraft refresh tokens for every launcher.',
    strings: [/launcher_accounts(_microsoft_store)?\.json|launcher_profiles\.json|microsoft_accounts\.json|lunarclient.*accounts\.json|feather.*accounts\.json|\.minecraft[\\/]+essential|tlauncher.*\.json|prismlauncher.*accounts|polymc.*accounts|multimc.*accounts|badlion.*accounts/i],
  },
  {
    id: 'discord-token', severity: 'critical', category: 'Account theft',
    title: 'Discord token grabbing',
    why: 'Reading Discord\'s leveldb storage or matching token patterns = Discord token grabber.',
    strings: [/discord(canary|ptb)?[\\/]+Local Storage|Local Storage[\\/]+leveldb|\[\\w-\]\{2[34]\}|dQw4w9WgXcQ:|mfa\\\./i],
  },
  {
    id: 'browser-data', severity: 'critical', category: 'Account theft',
    title: 'Browser passwords / cookies',
    why: 'Paths to browser credential stores. Nothing in a Minecraft mod needs these.',
    strings: [/Login Data|Web Data|Network[\\/]+Cookies|[\\/]Cookies$|Local State|User Data[\\/]+Default|Google[\\/]+Chrome|BraveSoftware|Opera Software|Microsoft[\\/]+Edge|Mozilla[\\/]+Firefox|logins\.json|key4\.db/i],
  },
  {
    id: 'dpapi', severity: 'high', category: 'Account theft',
    title: 'Windows DPAPI / crypto unprotect',
    why: 'Used to decrypt saved browser passwords and Discord tokens.',
    strings: [/CryptUnprotectData|os_crypt|encrypted_key|Crypt32/i],
  },
  {
    id: 'crypto-wallets', severity: 'critical', category: 'Account theft',
    title: 'Crypto wallet paths',
    why: 'Looks for wallet files (Exodus, Atomic, MetaMask, …).',
    strings: [/Exodus|Atomic[\\/]+Local Storage|Electrum|nkbihfbeogaeaoehlefnkodbefgpgknn|wallet\.dat|Ethereum[\\/]+keystore/i],
  },
  {
    id: 'clipboard', severity: 'medium', category: 'Spyware',
    title: 'Clipboard access',
    why: 'Clippers swap crypto addresses you copy. Some mods use the clipboard legitimately.',
    classes: ['java/awt/datatransfer/Clipboard', 'java/awt/datatransfer/StringSelection'],
    methods: [/java\/awt\/Toolkit\.getSystemClipboard$/],
  },
  {
    id: 'screenshot', severity: 'medium', category: 'Spyware',
    title: 'Desktop screenshots',
    why: 'java.awt.Robot screen capture grabs your whole desktop, not the game.',
    methods: [/java\/awt\/Robot\.createScreenCapture$/],
  },

  // ---- Execution / loading ----------------------------------------------
  {
    id: 'runtime-exec', severity: 'high', category: 'Execution',
    title: 'Runs system commands',
    why: 'Runtime.exec / ProcessBuilder can run anything on your PC.',
    methods: [/java\/lang\/Runtime\.exec$/, /java\/lang\/ProcessBuilder\.start$/, /java\/lang\/ProcessBuilder\.<init>$/],
  },
  {
    id: 'shell-strings', severity: 'high', category: 'Execution',
    title: 'Shell / PowerShell commands',
    why: 'Command strings for cmd, PowerShell or bash.',
    strings: [/powershell(\.exe)?\s|cmd(\.exe)?\s+\/c|\/bin\/(ba)?sh|-EncodedCommand|Invoke-WebRequest|iwr\s|bitsadmin|certutil\s+-urlcache|mshta|rundll32|regsvr32/i],
  },
  {
    id: 'dynamic-loading', severity: 'high', category: 'Loader',
    title: 'Loads code at runtime',
    why: 'Downloading or defining classes at runtime lets a "clean" jar fetch the real malware later.',
    methods: [/java\/lang\/ClassLoader\.defineClass$/, /java\/security\/SecureClassLoader\.defineClass$/, /java\/lang\/invoke\/MethodHandles\$Lookup\.defineClass$/, /sun\/misc\/Unsafe\.defineClass$/, /sun\/misc\/Unsafe\.defineAnonymousClass$/],
    classes: ['java/net/URLClassLoader'],
  },
  {
    id: 'native-load', severity: 'high', category: 'Loader',
    title: 'Loads native libraries',
    why: 'Native code (DLL/SO) can\'t be decompiled and can do anything.',
    methods: [/java\/lang\/System\.load$/, /java\/lang\/System\.loadLibrary$/, /java\/lang\/Runtime\.load$/],
  },
  {
    id: 'native-files', severity: 'high', category: 'Loader',
    title: 'Bundled executables / native libs',
    why: 'Executables hidden inside a jar are a classic dropper trick.',
    files: [/\.(exe|dll|scr|bat|cmd|ps1|vbs|hta|msi|so|dylib)$/i],
  },
  {
    id: 'reflection', severity: 'low', category: 'Obfuscation',
    title: 'Heavy reflection',
    why: 'Reflection hides what is being called. Normal in many mods; matters combined with other hits.',
    methods: [/java\/lang\/reflect\/Method\.invoke$/, /java\/lang\/Class\.forName$/],
  },
  {
    id: 'crypto', severity: 'low', category: 'Obfuscation',
    title: 'Encryption APIs',
    why: 'Often used to decrypt hidden strings or payloads.',
    classes: ['javax/crypto/Cipher', 'javax/crypto/spec/SecretKeySpec'],
  },

  // ---- Persistence ------------------------------------------------------
  {
    id: 'persistence', severity: 'critical', category: 'Persistence',
    title: 'Autostart / persistence',
    why: 'Copies itself to Startup, a Run key, a scheduled task or a cron/launch agent.',
    strings: [/Start Menu[\\/]+Programs[\\/]+Startup|CurrentVersion[\\/]+Run|schtasks|reg(\.exe)?\s+add|LaunchAgents|crontab|\.bashrc|systemd[\\/]+user/i],
  },
  {
    id: 'av-evasion', severity: 'critical', category: 'Evasion',
    title: 'Antivirus / sandbox evasion',
    why: 'Disables Defender or checks for VMs and analysis tools.',
    strings: [/Add-MpPreference|Set-MpPreference|DisableRealtimeMonitoring|ExclusionPath|vboxservice|vmtoolsd|sandboxie|wireshark|processhacker|ida64|x64dbg/i],
  },

  // ---- Network primitives (weak signal on their own) ---------------------
  {
    id: 'http', severity: 'low', category: 'Network',
    title: 'Makes HTTP requests',
    why: 'Most clients do (updates, capes). Only bad combined with stolen data.',
    classes: ['java/net/HttpURLConnection', 'javax/net/ssl/HttpsURLConnection', 'java/net/http/HttpClient', 'okhttp3/OkHttpClient', 'org/apache/http/impl/client/HttpClients'],
  },
  {
    id: 'raw-socket', severity: 'medium', category: 'Network',
    title: 'Raw sockets',
    why: 'Raw TCP sockets are used by RATs for remote control.',
    classes: ['java/net/Socket', 'java/net/ServerSocket'],
  },
];

module.exports = { rules, W };
