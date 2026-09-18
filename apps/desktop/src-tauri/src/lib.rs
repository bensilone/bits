use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;

use tauri::Manager;

struct WorkerState {
    child: Option<Child>,
}

static WORKER: Mutex<WorkerState> = Mutex::new(WorkerState { child: None });

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
        // Best-effort: signal process group, then the child itself
        let _ = Command::new("kill")
            .args(["-TERM", &format!("-{}", pid)])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        let _ = child.kill();
    }
    let _ = child.wait();
}

fn binaries_xmrig_dir() -> PathBuf {
    // Dev: cwd is often apps/desktop/src-tauri → ../binaries/xmrig
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
fn stop_worker() -> Result<(), String> {
    let mut state = WORKER.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = state.child.take() {
        kill_process_tree(&mut child);
    }
    Ok(())
}

#[tauri::command]
fn start_xmrig(
    app: tauri::AppHandle,
    config_path: String,
    binary_path: String,
    threads: Option<u32>,
) -> Result<(), String> {
    let mut state = WORKER.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = state.child.take() {
        kill_process_tree(&mut child);
    }

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
    state.child = Some(child);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            stop_worker,
            start_xmrig,
            resolve_xmrig_binary,
            write_xmrig_config
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sparks");
}
