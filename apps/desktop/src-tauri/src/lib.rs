use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;

struct WorkerState {
    child: Option<Child>,
    binary_path: Option<PathBuf>,
}

static WORKER: Mutex<WorkerState> = Mutex::new(WorkerState {
    child: None,
    binary_path: None,
});

fn worker_pid_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join("worker.pid"))
}

fn write_worker_pid(app: &tauri::AppHandle, pid: u32) {
    if let Some(path) = worker_pid_path(app) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&path, pid.to_string());
    }
}

fn kill_pid(pid: u32) {
    if pid == 0 {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(target_os = "windows"))]
    {
        // TERM then KILL if still alive
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        std::thread::sleep(Duration::from_millis(200));
        let still = Command::new("kill")
            .args(["-0", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false);
        if still {
            let _ = Command::new("kill")
                .args(["-KILL", &pid.to_string()])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
        }
    }
}

fn kill_process_tree(child: &mut Child) {
    let pid = child.id();
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(target_os = "windows"))]
    {
        // Prefer process-group kill when we spawned with setsid
        let _ = Command::new("kill")
            .args(["-TERM", &format!("-{}", pid)])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = child.kill();
        std::thread::sleep(Duration::from_millis(150));
        let _ = Command::new("kill")
            .args(["-KILL", &format!("-{}", pid)])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = Command::new("kill")
            .args(["-KILL", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.wait();
}

/// Kill leftover worker processes that match our binary path (orphans after crash/quit).
fn kill_orphans_matching_binary(binary: &Path) {
    let Some(bin_str) = binary.to_str() else {
        return;
    };
    #[cfg(target_os = "windows")]
    {
        // Match command line containing our binary path
        let _ = Command::new("wmic")
            .args([
                "process",
                "where",
                &format!("ExecutablePath='{}'", bin_str.replace('\'', "")),
                "call",
                "terminate",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(target_os = "windows"))]
    {
        // pgrep -f with full path; only kill PIDs whose args contain that path
        if let Ok(out) = Command::new("pgrep").args(["-f", bin_str]).output() {
            if out.status.success() {
                for line in String::from_utf8_lossy(&out.stdout).lines() {
                    if let Ok(pid) = line.trim().parse::<u32>() {
                        // Don't kill ourselves
                        if pid != std::process::id() {
                            kill_pid(pid);
                        }
                    }
                }
            }
        }
    }
}

fn stop_worker_inner(app: Option<&tauri::AppHandle>) {
    // 1) Tracked child
    if let Ok(mut state) = WORKER.lock() {
        let bin = state.binary_path.clone();
        if let Some(mut child) = state.child.take() {
            kill_process_tree(&mut child);
        }
        state.binary_path = None;
        // 2) Orphans for that binary
        if let Some(ref b) = bin {
            kill_orphans_matching_binary(b);
        }
    }

    // 3) PID file from a previous run
    if let Some(app) = app {
        if let Some(path) = worker_pid_path(app) {
            if let Ok(s) = std::fs::read_to_string(&path) {
                if let Ok(pid) = s.trim().parse::<u32>() {
                    kill_pid(pid);
                }
            }
            let _ = std::fs::remove_file(&path);
        }
        // Also try default binary location orphans if we know it
        if let Ok(bin) = resolve_xmrig_binary() {
            kill_orphans_matching_binary(Path::new(&bin));
        }
    }
}

fn binaries_xmrig_dir() -> PathBuf {
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("binaries/xmrig"));
        candidates.push(cwd.join("../binaries/xmrig"));
        candidates.push(cwd.join("../../binaries/xmrig"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            candidates.push(parent.join("binaries/xmrig"));
            candidates.push(parent.join("../binaries/xmrig"));
            candidates.push(parent.join("../../binaries/xmrig"));
            candidates.push(parent.join("../../../binaries/xmrig"));
        }
    }
    candidates.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../binaries/xmrig"));

    for c in candidates {
        if let Ok(canon) = c.canonicalize() {
            if canon.is_dir() {
                return canon;
            }
        }
        if c.is_dir() {
            return c;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../binaries/xmrig")
}

fn expected_binary_name() -> &'static str {
    #[cfg(target_os = "windows")]
    {
        "xmrig.exe"
    }
    #[cfg(not(target_os = "windows"))]
    {
        "xmrig"
    }
}

#[tauri::command]
fn resolve_xmrig_binary() -> Result<String, String> {
    let dir = binaries_xmrig_dir();
    let path = dir.join(expected_binary_name());
    if !path.is_file() {
        return Err(format!(
            "XMRig binary not found at {}. Run: cd apps/desktop && npm run fetch-worker",
            path.display()
        ));
    }
    Ok(path
        .canonicalize()
        .unwrap_or(path)
        .to_string_lossy()
        .into_owned())
}

#[tauri::command]
fn write_xmrig_config(app: tauri::AppHandle, contents: String) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())
        .or_else(|_| {
            binaries_xmrig_dir()
                .parent()
                .map(|p| p.to_path_buf())
                .ok_or_else(|| "no config dir".to_string())
        })?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("xmrig-config.json");
    let mut f = File::create(&path).map_err(|e| e.to_string())?;
    f.write_all(contents.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn stop_worker(app: tauri::AppHandle) -> Result<(), String> {
    stop_worker_inner(Some(&app));
    Ok(())
}

#[tauri::command]
fn start_xmrig(
    app: tauri::AppHandle,
    config_path: String,
    binary_path: String,
    threads: Option<u32>,
) -> Result<(), String> {
    // Always clear any previous / orphaned worker first
    stop_worker_inner(Some(&app));

    let bin = PathBuf::from(&binary_path);
    if !bin.is_file() {
        return Err(format!(
            "XMRig binary not found at {}. Run: cd apps/desktop && npm run fetch-worker",
            bin.display()
        ));
    }
    let cfg = PathBuf::from(&config_path);
    if !cfg.is_file() {
        return Err(format!("Config not found at {}", cfg.display()));
    }

    let log_dir = app
        .path()
        .app_data_dir()
        .ok()
        .or_else(|| binaries_xmrig_dir().parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."));
    let _ = std::fs::create_dir_all(&log_dir);
    let log_path = log_dir.join("xmrig.log");
    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .ok();
    let (stdout, stderr) = match log_file {
        Some(f) => {
            let f2 = f.try_clone().ok();
            (
                Stdio::from(f),
                f2.map(Stdio::from).unwrap_or_else(Stdio::null),
            )
        }
        None => (Stdio::null(), Stdio::null()),
    };

    let mut cmd = Command::new(&bin);
    cmd.arg(format!("--config={}", cfg.display()));
    if let Some(t) = threads {
        if t > 0 {
            cmd.arg(format!("--threads={}", t));
        }
    }
    cmd.stdout(stdout).stderr(stderr);

    let child = cmd.spawn().map_err(|e| {
        format!(
            "Failed to spawn XMRig ({}): {}. AV may have blocked the binary.",
            bin.display(),
            e
        )
    })?;
    write_worker_pid(&app, child.id());

    let mut state = WORKER.lock().map_err(|e| e.to_string())?;
    state.binary_path = Some(bin);
    state.child = Some(child);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            stop_worker,
            start_xmrig,
            resolve_xmrig_binary,
            write_xmrig_config
        ])
        .setup(|app| {
            // Clear orphans from a previous unclean quit
            stop_worker_inner(Some(app.handle()));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running Bits")
        .run(|app_handle, event| match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                stop_worker_inner(Some(app_handle));
            }
            tauri::RunEvent::WindowEvent { event, .. } => {
                if let tauri::WindowEvent::CloseRequested { .. } = event {
                    stop_worker_inner(Some(app_handle));
                }
            }
            _ => {}
        });
}
