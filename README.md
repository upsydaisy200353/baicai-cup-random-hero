# 白菜杯 · 随机英雄

英雄联盟随机选英雄工具：6 支队伍各 5 人，选择两队对阵，每人随机 3 个英雄选 1，本局英雄不重复。

## 本地运行

```bash
python -m http.server 8765
```

浏览器打开 http://localhost:8765

或双击 `start.bat`（Windows）。

## 更新英雄数据

```bash
python scripts/fetch_champions.py
python -c "import json; from pathlib import Path; c=json.load(open('data/champions.json',encoding='utf-8'))['champions']; slim=[{'id':x['id'],'name_zh':x['name_zh'],'title_zh':x['title_zh'],'splash_key':x['splash_key'],'splash_url':x['splash_url']} for x in c]; Path('js').mkdir(exist_ok=True); open('js/champions-data.js','w',encoding='utf-8').write('window.CHAMPIONS='+json.dumps(slim,ensure_ascii=False)+';')"
```

## Render 部署

### 一键部署（推荐）

在项目目录 PowerShell 运行：

```powershell
.\deploy.ps1
```

脚本会自动：登录 GitHub → 创建仓库 → 推送代码，并输出 Render 配置步骤。

### 手动部署

1. 将代码推送到 GitHub（仓库需包含 `render.yaml`）
2. 打开 [Render Blueprints](https://dashboard.render.com/blueprints)
3. **New Blueprint Instance** → 连接 GitHub 仓库
4. Render 自动识别 `render.yaml` 并部署静态站点

或手动创建 **Static Site**：
- Build Command: `echo "no build"`
- Publish Directory: `.`
- 环境变量: `SKIP_INSTALL_DEPS=true`
