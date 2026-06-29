# 一键部署：GitHub + Render
# 用法：在 PowerShell 中运行 .\deploy.ps1
# 可选参数：-RepoName "baicai-cup-random-hero" -GitHubUser "你的用户名"

param(
    [string]$RepoName = "baicai-cup-random-hero",
    [string]$GitHubUser = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== 白菜杯随机英雄 · 部署脚本 ===" -ForegroundColor Cyan

# 1. 检查 gh 登录
Write-Host "`n[1/4] 检查 GitHub 登录状态..." -ForegroundColor Yellow
cmd /c "gh auth status >nul 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "未登录 GitHub，请在弹出的浏览器中完成登录..." -ForegroundColor Yellow
    gh auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) { throw "GitHub 登录失败，请手动运行: gh auth login" }
}

if (-not $GitHubUser) {
    $GitHubUser = gh api user -q .login
    Write-Host "检测到 GitHub 用户: $GitHubUser"
}

# 2. 确保 git 仓库已提交
Write-Host "`n[2/4] 检查 Git 状态..." -ForegroundColor Yellow
if (-not (Test-Path .git)) {
    git init
    git branch -M main
}

$status = git status --porcelain
if ($status) {
    git add -A
    $env:GIT_AUTHOR_NAME = $GitHubUser
    $env:GIT_AUTHOR_EMAIL = "$GitHubUser@users.noreply.github.com"
    $env:GIT_COMMITTER_NAME = $GitHubUser
    $env:GIT_COMMITTER_EMAIL = "$GitHubUser@users.noreply.github.com"
    git commit -m "Update: 白菜杯随机英雄"
    Write-Host "已提交本地更改"
} else {
    Write-Host "工作区干净，无需提交"
}

# 3. 创建 GitHub 仓库并推送
Write-Host "`n[3/4] 创建/推送 GitHub 仓库..." -ForegroundColor Yellow
$remoteUrl = "https://github.com/$GitHubUser/$RepoName.git"
$hasRemote = git remote get-url origin 2>$null
if (-not $hasRemote) {
    gh repo create $RepoName --public --source=. --remote=origin --push --description "白菜杯随机英雄选英雄工具"
    if ($LASTEXITCODE -ne 0) { throw "创建 GitHub 仓库失败（可能已存在，尝试手动添加 remote）" }
} else {
    git push -u origin main
    if ($LASTEXITCODE -ne 0) { throw "推送到 GitHub 失败" }
}

Write-Host "GitHub 仓库: https://github.com/$GitHubUser/$RepoName" -ForegroundColor Green

# 4. Render 部署指引
Write-Host "`n[4/4] Render 部署" -ForegroundColor Yellow
Write-Host @"

仓库已推送。请按以下步骤在 Render 部署：

方式 A（推荐 · Blueprint 一键部署）：
  1. 打开 https://dashboard.render.com/blueprints
  2. 点击 New Blueprint Instance
  3. 连接 GitHub 仓库: $GitHubUser/$RepoName
  4. Render 会自动读取 render.yaml 并创建静态站点
  5. 部署完成后访问 https://baicai-cup-random-hero.onrender.com （或 Render 分配的 URL）

方式 B（手动创建 Static Site）：
  1. 打开 https://dashboard.render.com/static/new
  2. 连接仓库 $GitHubUser/$RepoName
  3. 设置：
     - Name: baicai-cup-random-hero
     - Branch: main
     - Build Command: echo "no build"
     - Publish Directory: .
  4. 添加环境变量 SKIP_INSTALL_DEPS = true
  5. 点击 Create Static Site

"@ -ForegroundColor White

Write-Host "完成！" -ForegroundColor Green
