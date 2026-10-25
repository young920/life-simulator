# 上线凭据与申请步骤

更新日期：2026-10-25（Asia/Shanghai）

本文件只保存凭据名称、申请入口和状态，不保存任何密钥值。

## 已有本地凭据

项目根目录的 .env.local 已包含 QingxiaoYun 文字模型 API 和 Agnes 图片 API 配置，并被 .gitignore 排除。现有 key 已用于模型目录查询、文字模型测试和 Agnes 生图请求。不要把 .env.local 内容贴到聊天、文档、截图或源代码里。

变量名如下：

- MODEL_API_KEY
- MODEL_BASE_URL
- MODEL_NAME
- AGNES_API_KEY
- AGNES_BASE_URL
- AGNES_IMAGE_MODEL

模型服务端点和生产模型顺序在 HANDOFF.md 中更新；生产环境建议重新创建独立 key，避免把开发流量与线上流量混在同一额度和统计里。

## 建议申请的生产文字模型 key

服务商：QingxiaoYun  
官网/控制台：https://ai.qingxiaoyun.net/  
官方快速入门：https://docs.qingxiaoyun.net/guide/getting-started.html

申请步骤：

1. 登录 QingxiaoYun 控制台。
2. 检查订阅和可用额度。官方快速入门说明，控制台可能要求先订阅套餐。
3. 打开左侧“令牌管理”，选择“添加令牌”，名称可填“人生模拟器生产环境”。
4. 创建后马上复制 key 到密码管理器；页面可能只显示一次。
5. 部署时将它作为生产环境 secret，变量名是 MODEL_API_KEY；不要存进 .openai/hosting.json 或浏览器代码。

若当前套餐/额度已满足上线需求，可以保留现有 key；为开发和生产隔离而新建专用 key 是建议，不是本地运行的前置条件。

## 建议申请的 Agnes 生图生产 key

Agnes API Platform：https://platform.agnes-ai.com/  
官方 API 模型与接入说明：https://github.com/AgnesAI-Labs/skills/blob/main/agnes-ai-models/SKILL.md

申请步骤：

1. 登录 Agnes API Platform。
2. 在 API Keys / API 密钥页面创建一个独立 key，名称填“人生模拟器生产环境”。
3. 确认账户能访问 agnes-image-2.5-flash，并检查图片调用的额度或限速。
4. 把 key 放入生产环境 secret，变量名是 AGNES_API_KEY。
5. 首选模型和地址使用 AGNES_IMAGE_MODEL 与 AGNES_BASE_URL；当前本地验证过的图片模型是 agnes-image-2.5-flash，图片失败时服务端可尝试 agnes-image-2.1-flash。

当前旧项目配置中的 Agnes key 已在本地使用并成功生成过图片；新建生产 key 用于隔离环境和额度统计。视频模型没有单独申请过；Agnes 视频 API 是否可用/有额度尚未实测，视频不属于第一版上线前置项。

## 上线平台凭据

项目当前的 .openai/hosting.json 没有 project_id，尚未创建托管 Site。若选择 Codex Sites：

- 不需要手动向 Cloudflare 申请 API token。Sites 的源码仓库写凭据由其发布流程短期生成，不要手工保存或贴进源代码。
- Site 建立后，通过 Sites runtime environment secrets 配置 MODEL_API_KEY 和 AGNES_API_KEY；MODEL_BASE_URL、MODEL_NAME、AGNES_BASE_URL、AGNES_IMAGE_MODEL 作为普通 runtime 环境变量配置。
- 新 Site 默认私有；建立 Site 时保持私有，确认后再决定是否公开。

重要架构前置：当前前端使用 Vite mobile-app 模板，server/index.mjs 是 Node 本地 API；worker/index.js 目前只服务静态资源。Sites 托管 Worker 不能直接运行 node:http 服务。正式发布前，需要将 /api/models、/api/life-plan、/api/test-model-chain 和 /api/image 移植到 Worker，并用 Sites secrets 读取 key；或者明确选一个 Node 后端托管平台并按该平台要求准备 deploy token。此刻不要提前申请随机云厂商 token，先按现有 Sites 路线完成 API 迁移。

当前本地运行方式：

- npm run dev 启动前端 4173。
- npm run dev:api 启动本地 API 4174。

## 用户需要操作的内容

1. 在 QingxiaoYun 控制台检查套餐/额度；若需要生产隔离，再创建生产 key。
2. 在 Agnes 平台检查图片额度；若需要生产隔离，再创建生产 key。
3. 创建生产 Sites 之前确认私有访问范围；API 迁入 Worker 后，再把两个 key 设成 runtime secrets。
4. 不要把 key 发到聊天里。若要在本地更新 key，可在 .env.local 中操作；线上 key 由托管平台 secret 设置管理。
