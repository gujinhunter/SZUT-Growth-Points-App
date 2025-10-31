// app.js
App({
    // 小程序一启动就会执行onLaunch()
  onLaunch() {
    this.globalData = {    // this就是这里的app实例，this.globalData是整个小程序的共享数据库，可以在这里挂载全局变量，方法等
      // env 参数说明：
      //   env 参数决定接下来小程序发起的云开发调用（wx.cloud.xxx）会默认请求到哪个云环境的资源
      //   此处请填入环境 ID, 环境 ID 可打开云控制台查看
      //   如不填则使用默认环境（第一个创建的环境）
      env: "cloud1-5gz9fdn03b5b5779",
      userInfo: null 
    };
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
      return;
    } else {
        // 只初始化一次，整个小程序后续的 wx.cloud.callFunction()、wx.cloud.database() 都会自动使用这个环境。
      wx.cloud.init({
        env: this.globalData.env,  // 直接使用上面定义的全局变量，更利于代码维护，更换云环境只要改变globalData里面的env值
        traceUser: true,   // 是否记录用户访问来源
      });
    }
  },

  globalData: {}   // globalData 外部声明 结构清晰
                   // onLaunch() 内赋值 初始化内容
                   // 其他页面调用 不会因为未定义而报错
});



// 1. 这是入口文件，有了这里的cloud.init()，
// 整个小程序后续的 wx.cloud.callFunction()、wx.cloud.database() 都会自动使用这个环境。