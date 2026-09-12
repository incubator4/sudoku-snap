# 数独自动填写

基于 React / Next.js 的数独求解器。在 9×9 棋盘上手动输入已知数字，粘贴题目文本，或上传照片识别棋盘，然后一键自动填写剩余空格。

## 功能

- 点击格子，用键盘或数字键输入 1-9
- 上传、拍照或粘贴数独照片，自动找出 9×9 棋盘并识别已知数字
- 粘贴 81 位题目（空位可用 `0`、`.`、空格或换行）
- 载入入门 / 中等 / 困难样例
- 冲突检测：同一行、列、宫的重复数字会标红
- 回溯求解，可逐步动画填写或立即填完

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开 [http://localhost:43123](http://localhost:43123)。

```bash
npm test    # 求解器单测
npm run lint
npm run build
```

## 部署到 Cloudflare Workers

本项目通过 [OpenNext](https://opennext.js.org/cloudflare) 部署到 Cloudflare Workers，不要用 Pages / `@cloudflare/next-on-pages`。

```bash
npx wrangler login
npm run preview   # 本地用 Workers runtime 预览
npm run deploy    # 构建并发布到 Workers
```

发布后会得到 `sudoku-snap.<account>.workers.dev`。也可以在 Cloudflare Dashboard 把仓库接到 **Workers Builds**：

- Build command: `npx opennextjs-cloudflare build`
- Deploy command: `npx opennextjs-cloudflare deploy`
- Non-production deploy command: `npx opennextjs-cloudflare upload`

## 使用说明

1. 在棋盘上填入题目中的已知数字，空位留空。
2. 也可把整道题粘贴到右侧文本框，或在「图片识别」中上传 / 拍照 / 粘贴截图。
3. 识别结果会先预览，点「应用到棋盘」后再核对个别格子。
4. 点「自动填写」。已知数字保持加粗黑色，程序填入的数字显示为青色。
5. 「只清填写」会去掉求解结果、保留原题；「清空棋盘」会全部重置。
