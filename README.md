# 你想活出怎样的人生

一个可玩的移动端 AI 人生模拟器原型。选择世界、时代、身份与志向，由模型编织人物、关系、关键事件和年度记忆；在重要节点作出选择，逐年走到人生终章。

## 产品讲解图

AI 生成的横板产品介绍图：[`public/assets/product-explainer-landscape-ai.webp`](public/assets/product-explainer-landscape-ai.webp)

可编辑矢量版：[`public/assets/product-explainer-3x4.svg`](public/assets/product-explainer-3x4.svg)

## 本地运行

```bash
npm install
npm run dev:api
npm run dev
```

本地 API 从被忽略的 `.env.local` 读取模型配置。不要把密钥放进浏览器代码、静态构建产物或 Git 历史。

## 部署说明

前端使用 Vite，静态托管 Worker 位于 `worker/index.js`。当前本地 API 在 `server/index.mjs`，线上部署前需要在托管运行时提供对应 API 路由和运行时 secrets。产品界面、生成流程及本地服务说明见 `HANDOFF.md` 与 `PUBLISH_CREDENTIALS.md`。

