# 安装包下载说明

安装包会在 GitHub Releases 中按系统和架构区分发布。

## 推荐下载

| 系统 | 适用设备 | 推荐文件 |
| --- | --- | --- |
| macOS Apple Silicon | M1 / M2 / M3 / M4 等芯片 | `Hermes-Console-<version>-mac-arm64.dmg` |
| macOS Intel | Intel 芯片 Mac | `Hermes-Console-<version>-mac-x64.dmg` |
| Windows x64 | Windows 10 / 11 64 位 | `Hermes-Console-<version>-win-x64-Setup.exe` |

## 备用包

| 系统 | 文件 | 用途 |
| --- | --- | --- |
| macOS Apple Silicon | `Hermes-Console-<version>-mac-arm64.zip` | 无法使用 DMG 时手动解压 |
| macOS Intel | `Hermes-Console-<version>-mac-x64.zip` | 无法使用 DMG 时手动解压 |
| Windows x64 | `Hermes-Console-<version>-win-x64.exe` | 免安装便携版 |

## 校验文件

Release 中同时提供：

```txt
Hermes-Console-<version>-SHA256SUMS.txt
```

下载后可用 SHA256 校验文件完整性。

> 当前安装包为本地打包产物，未接入 Apple / Windows 正式代码签名。首次打开时系统可能提示开发者身份或安全确认。
