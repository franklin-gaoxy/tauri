use serde::Serialize;
use std::path::{Path, PathBuf};

/// 目录树节点，直接序列化给前端（字段名转成 camelCase，前端按 isDir 判断目录）
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    /// 目录才有 children，文件为 None
    pub children: Option<Vec<Node>>,
}

/// 侧边栏展示的文档后缀
const DOC_EXT: [&str; 5] = ["md", "markdown", "mdown", "mdx", "txt"];
/// 不进入的目录
const SKIP_DIR: [&str; 6] = ["node_modules", "target", "dist", ".git", ".idea", ".vscode"];

fn is_doc(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| DOC_EXT.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// 只读取一层：目录展开时再按需请求下一层，避免打开磁盘根目录时递归扫描整个盘
fn read_level(dir: &Path) -> Vec<Node> {
    let mut out: Vec<Node> = Vec::new();
    let Ok(read) = std::fs::read_dir(dir) else {
        return out;
    };

    for entry in read.flatten() {
        let path: PathBuf = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };

        if meta.is_dir() {
            if SKIP_DIR.contains(&name.as_str()) {
                continue;
            }
            out.push(Node {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: true,
                // None 表示尚未加载子项，前端展开时再请求
                children: None,
            });
        } else if meta.is_file() && is_doc(&path) {
            out.push(Node {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                children: None,
            });
        }
    }

    // 目录在前，同类按名称排序
    out.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    out
}

/// Windows 里 "D:" 表示“D 盘当前目录”（即进程工作目录），不是盘符根目录。
/// 直接 read_dir 会读到 cargo 的 target\debug 这类目录，必须补成 "D:\"。
fn resolve_dir(raw: &str) -> PathBuf {
    let s = raw.trim();
    let b = s.as_bytes();
    if b.len() == 2 && b[0].is_ascii_alphabetic() && b[1] == b':' {
        return PathBuf::from(format!("{s}\\"));
    }
    PathBuf::from(s)
}

/// 读取目录的一层内容；展开子目录时前端再次调用
#[tauri::command]
pub fn list_tree(root: String) -> Result<Vec<Node>, String> {
    let p = resolve_dir(&root);
    // 相对路径会解析到工作目录，属于调用方传错了，直接报错而不是悄悄列出别处的内容
    if !p.is_absolute() {
        return Err(format!("需要绝对路径: {root}"));
    }
    if !p.is_dir() {
        return Err(format!("不是有效目录: {root}"));
    }
    Ok(read_level(&p))
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.is_file() {
        return Err(format!("文件不存在: {path}"));
    }
    std::fs::read_to_string(p).map_err(|e| format!("读取失败: {e}"))
}

/// 读取本地图片原始字节，前端转 Blob URL 用于预览
#[tauri::command]
pub fn read_image(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("读取图片失败: {e}"))
}

/// 新建空文件，同名已存在时拒绝，避免覆盖已有内容
#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if p.exists() {
        return Err("同名文件已存在".to_string());
    }
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
    }
    std::fs::write(&p, "").map_err(|e| format!("创建失败: {e}"))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
        }
    }
    std::fs::write(&p, content).map_err(|e| format!("写入失败: {e}"))
}
