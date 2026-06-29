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

仓库已包含 `render.yaml`。在 [Render Dashboard](https://dashboard.render.com) 新建 **Blueprint** 或 **Static Site**，连接本 GitHub 仓库即可自动部署。
