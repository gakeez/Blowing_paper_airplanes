export default {
  async fetch(request, env, ctx) {
    // 所有请求直接交给静态资源系统处理
    return env.ASSETS.fetch(request);
  },
};

