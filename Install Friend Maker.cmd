@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul

for %%I in ("%~dp0.") do set "ROOT_DIR=%%~fI"
set "WINGET_EXE="
set "PYTHON_EXE="
set "PYTHON_ARGS="
set "PLATFORMIO_BIN="

call :refresh_path

echo.
echo [Friend Maker] Windows 一键安装脚本
echo.

if not exist "%ROOT_DIR%\package.json" (
  call :fail "当前目录下没有找到 package.json，请确认这个脚本放在项目根目录后再运行。"
  exit /b 1
)

call :ensure_node_and_npm
if errorlevel 1 exit /b 1

call :ensure_python
if errorlevel 1 exit /b 1

call :ensure_platformio
if errorlevel 1 exit /b 1

pushd "%ROOT_DIR%" >nul
if errorlevel 1 (
  call :fail "无法进入项目目录：%ROOT_DIR%"
  exit /b 1
)

call :show_versions

call :print_step "正在安装项目依赖..."
call npm install
if errorlevel 1 (
  popd >nul
  call :fail "npm install 执行失败，请检查网络连接，或确认 Node.js / npm 是否安装正常；如果自动安装不顺利，也可以直接按手动安装流程继续。"
  exit /b 1
)

call :print_step "正在检查项目配置..."
call npm run check
if errorlevel 1 (
  popd >nul
  call :fail "npm run check 执行失败，请确认依赖是否已完整安装；如果自动安装不顺利，也可以直接按手动安装流程继续。"
  exit /b 1
)

popd >nul

echo.
echo [Friend Maker] 安装完成。
echo [Friend Maker] 下一步请在项目目录中运行：npm run ui:dev
echo [Friend Maker] 启动后请在浏览器打开：http://127.0.0.1:4307
echo.
pause
exit /b 0

:refresh_path
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles(x86)%\nodejs;%LocalAppData%\Programs\Python\Launcher;%LocalAppData%\Programs\Python\Python313;%LocalAppData%\Programs\Python\Python312;%LocalAppData%\Programs\Python\Python311;%LocalAppData%\Microsoft\WindowsApps;%PATH%"
exit /b 0

:print_step
echo.
echo [Friend Maker] %~1
exit /b 0

:show_versions
set "NODE_VERSION="
set "NPM_VERSION="
set "PYTHON_VERSION="

for /f "delims=" %%I in ('node -v 2^>nul') do set "NODE_VERSION=%%I"
for /f "delims=" %%I in ('npm -v 2^>nul') do set "NPM_VERSION=%%I"
for /f "delims=" %%I in ('"%PYTHON_EXE%" %PYTHON_ARGS% --version 2^>nul') do set "PYTHON_VERSION=%%I"

call :print_step "项目目录：%ROOT_DIR%"
echo [Friend Maker] Node.js: !NODE_VERSION!
echo [Friend Maker] npm: !NPM_VERSION!
echo [Friend Maker] !PYTHON_VERSION!
if defined PLATFORMIO_BIN echo [Friend Maker] PlatformIO: !PLATFORMIO_BIN!
exit /b 0

:fail
echo.
echo [Friend Maker] 安装失败
echo [Friend Maker] %~1
if exist "%ROOT_DIR%\docs\setup-windows.md" echo [Friend Maker] 你也可以改用手动安装流程：docs\setup-windows.md
echo.
pause
exit /b 1

:ensure_winget
set "WINGET_EXE="
for /f "delims=" %%I in ('where winget 2^>nul') do (
  set "WINGET_EXE=%%I"
  goto :winget_found
)

call :fail "未检测到 winget，无法自动安装 %~1。你可以先在 Microsoft Store 安装或更新“应用安装程序（App Installer）”后重试，或者直接按手动安装流程继续。"
exit /b 1

:winget_found
exit /b 0

:ensure_node_and_npm
call :refresh_path
where node >nul 2>nul
if not errorlevel 1 (
  where npm >nul 2>nul
  if not errorlevel 1 exit /b 0
)

call :install_with_winget "Node.js (LTS)" "OpenJS.NodeJS.LTS"
if errorlevel 1 exit /b 1

call :refresh_path
where node >nul 2>nul
if errorlevel 1 (
  call :fail "Node.js 安装完成后仍未检测到 node 命令，请重新打开命令行后再试一次。"
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  call :fail "Node.js 安装完成后仍未检测到 npm 命令，请重新打开命令行后再试一次。"
  exit /b 1
)

exit /b 0

:detect_python
set "PYTHON_EXE="
set "PYTHON_ARGS="

for /f "delims=" %%I in ('where py 2^>nul') do (
  set "PYTHON_EXE=%%I"
  set "PYTHON_ARGS=-3"
  goto :python_found
)

for /f "delims=" %%I in ('where python 2^>nul') do (
  set "PYTHON_EXE=%%I"
  set "PYTHON_ARGS="
  goto :python_found
)

exit /b 1

:python_found
exit /b 0

:ensure_python
call :refresh_path
call :detect_python
if not errorlevel 1 exit /b 0

call :install_python_with_winget
if errorlevel 1 exit /b 1

call :refresh_path
call :detect_python
if errorlevel 1 (
  call :fail "Python 安装完成后仍未检测到 python 或 py 命令，请重新打开命令行后再试一次。"
  exit /b 1
)

exit /b 0

:install_python_with_winget
call :ensure_winget "Python 3"
if errorlevel 1 exit /b 1

for %%I in (Python.Python.3.13 Python.Python.3.12 Python.Python.3.11) do (
  call :print_step "正在尝试通过 winget 安装 Python 3（%%I）..."
  "%WINGET_EXE%" install -e --id "%%I" --accept-package-agreements --accept-source-agreements --disable-interactivity
  if not errorlevel 1 exit /b 0
)

call :fail "自动安装 Python 3 失败，请手动安装 Python 3.11 及以上版本后再重新运行此脚本，或者直接按手动安装流程继续。"
exit /b 1

:detect_platformio
set "PLATFORMIO_BIN="

for /f "delims=" %%I in ('where pio 2^>nul') do (
  set "PLATFORMIO_BIN=%%I"
  goto :platformio_found
)

if exist "%USERPROFILE%\.platformio\penv\Scripts\pio.exe" (
  set "PLATFORMIO_BIN=%USERPROFILE%\.platformio\penv\Scripts\pio.exe"
  goto :platformio_found
)

exit /b 1

:platformio_found
exit /b 0

:ensure_platformio
call :refresh_path
call :detect_platformio
if not errorlevel 1 exit /b 0

call :print_step "正在安装 PlatformIO..."
"%PYTHON_EXE%" %PYTHON_ARGS% -m ensurepip --upgrade >nul 2>nul
"%PYTHON_EXE%" %PYTHON_ARGS% -m pip install --user --upgrade platformio
if errorlevel 1 (
  call :fail "PlatformIO 安装失败，请检查 Python 环境是否正常，或稍后重试；如果自动安装不顺利，也可以改用手动安装流程。"
  exit /b 1
)

call :refresh_path
call :detect_platformio
if errorlevel 1 (
  call :fail "PlatformIO 安装完成后仍未检测到 pio 命令，请重新打开命令行后再试一次。"
  exit /b 1
)

exit /b 0

:install_with_winget
call :ensure_winget "%~1"
if errorlevel 1 exit /b 1

call :print_step "正在通过 winget 安装 %~1..."
"%WINGET_EXE%" install -e --id "%~2" --accept-package-agreements --accept-source-agreements --disable-interactivity
if errorlevel 1 (
  call :fail "自动安装 %~1 失败，请手动安装后再重新运行此脚本，或者直接按手动安装流程继续。"
  exit /b 1
)

exit /b 0
