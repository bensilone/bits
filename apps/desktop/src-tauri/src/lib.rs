use std::process::Child;
use std::sync::Mutex;

struct WorkerState {
    child: Option<Child>,
}

static WORKER: Mutex<WorkerState> = Mutex::new(WorkerState { child: None });

#[tauri::command]
fn stop_worker() -> Result<(), String> {
    let mut state = WORKER.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = state.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

#[tauri::command]
fn start_worker_process(script: String, args: Vec<String>) -> Result<(), String> {
    let mut state = WORKER.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = state.child.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    // Placeholder: spawn bash/cmd script. Replace with RandomX binary spawn.
    #[cfg(target_os = "windows")]
    let child = std::process::Command::new("cmd")
        .arg("/c")
        .arg(&script)
        .args(&args)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(not(target_os = "windows"))]
    let child = std::process::Command::new("bash")
        .arg(&script)
        .args(&args)
        .spawn()
        .map_err(|e| e.to_string())?;
    state.child = Some(child);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![stop_worker, start_worker_process])
        .run(tauri::generate_context!())
        .expect("error while running Sparks");
}
