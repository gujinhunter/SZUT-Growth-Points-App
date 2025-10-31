// cloudfunctions/getOpenId/index.js
// 云函数入口文件
const cloud = require('wx-server-sdk')
cloud.init()


// 云函数入口函数
exports.main = async (event, context) => {
  // 获取微信上下文（包含 openid）
  const wxContext = cloud.getWXContext()
  return {
    openid: wxContext.OPENID,
    appid: wxContext.APPID,
    unionid: wxContext.UNIONID,
  }
}



// 1.云函数部署和执行的说明：
// 说明：当你部署云函数时，代码会被打包上传到腾讯云的数据中心。
// 云函数调用发生时，云平台会在准备好的 Node.js 运行环境里运行你的代码，
// 实际上就是在一台云端服务器（或容器）里执行 `node index.js`。
// 执行完毕后，平台负责回收或复用这些资源，所以我们不需要自己维护服务器。
// 这就是“无服务器”(Serverless) 模式：真正的服务器存在，但由腾讯云自动管理。

// 2.Promise和await的说明：
// Promise：表示一个“将来才会完成的异步任务”。它有 pending/fulfilled/rejected 三种状态，
// 可以用 .then() 处理成功结果，用 .catch() 捕获失败原因，让异步流程更清晰。
// await：只能写在 async 函数里，用来暂停等待 Promise 完成；成功时得到 Promise 的返回值，
// 失败时会抛出异常，需要搭配 try...catch 捕获错误。这样写异步代码可读性更好，避免层层回调。

// 3.导出和部署的说明：
// “导出”是 JS 模块语法：通过 exports.main = ... 把函数暴露给外部使用。
// “部署”是把整份代码上传到云端。两者概念不同：导出只是代码层面对外公开，
// 部署才是把这些代码送到云函数运行环境。

// 4.云函数入口写法的说明：
// 云函数入口写法基本固定：exports.main = async (...) => {}。
// 运行时只会调用导出的 main，所以名字不能改。
// 调用云函数时用的是部署时的“云函数名称”，定位到函数后才执行 main。


// 5.cloud.init()的说明：
// 基本都要先 cloud.init()：它会把 env 等配置告诉 SDK，
// 让后续 cloud.database()/uploadFile() 等 API 连对环境。
// 没初始化可能报错或跑到默认环境，getWXContext() 也拿不到正确身份。
// 虽然有时默认能跑，但官方推荐始终先 init()，更稳妥。

// 6.cloud.init()的说明：
// 有时只取 openid 看似不写 cloud.init() 也能跑，那是依赖默认环境。
// 官方仍建议显式 init，确保 SDK 绑定正确环境，避免日后切换或访问其他资源时出问题。
