"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const debug = require("debug")("egg-passport-wechat");
const assert = require("assert");
const Strategy = require("./lib/passport-wechat/index").Strategy;

function mountOneClient (config, app, client = "wechat") {
  config.passReqToCallback = true;

  assert(config.key, "[egg-passport-wechat] config.passportWechat.key required");
  assert(config.secret, "[egg-passport-wechat] config.passportWechat.secret required");

  app.passport.use(client, new Strategy(Object.assign({}, config, { appID: config.key, appSecret: config.secret }), (req, accessToken, refreshToken, profile, expiresIn, verified) => {
    profile._raw = JSON.stringify(profile)

    const user = {
      providerPlatform: "wechat",
      providerMedia: "wechat",
      provider: client,
      id: profile.unionid || profile.openid,
      name: profile.nickname,
      displayName: profile.nickname,
      photo: profile.headimgurl,
      gender: profile.sex === 1 ? "male" : (profile.sex === 2 ? "female" : "unknown"),
      expiresIn,
      accessToken,
      refreshToken,
      profile
    };

    debug("%s %s get user: %j", req.method, req.url, user);
    app.passport.doVerify(req, user, verified);
  }));
}
exports.default = (app) => {
  const config = app.config.passportWechat;

  if (config.clients) {
    for (const client in config.clients) {
      const c = config.clients[client];

      if (config.state) {
        c.state = config.state
      }

      if (config.client) {
        c.client = config.client
      }

      mountOneClient(c, app, client);
    }
  } else {
    mountOneClient(config, app);
  }
};
