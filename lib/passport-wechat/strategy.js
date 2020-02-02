'use strict';

var util = require('util');
var passport = require('passport-strategy');
var OAuth = require('wechat-oauth');
var debug = require('debug')('passport-wechat');
var extend = require("xtend");

function WechatStrategy(options, verify) {
  options = options || {};

  if (!verify) {
    throw new TypeError('WeChatStrategy required a verify callback');
  }

  if (typeof verify !== 'function') {
    throw new TypeError('_verify must be function');
  }

  if (!options.appID) {
    throw new TypeError('WechatStrategy requires a appID option');
  }

  if (!options.appSecret) {
    throw new TypeError('WechatStrategy requires a appSecret option');
  }

  passport.Strategy.call(this, options, verify);

  this.name = options.name || 'wechat';
  this._client = options.client;
  this._verify = verify;

  this._oauth = new OAuth({
    appid: options.appID,
    appsecret: options.appSecret,
    getToken: options.getToken,
    saveToken: options.saveToken,
    isMiniProgram: false,
    provider: options.provider,
    providerMedia: options.providerMedia,
    providerPlatform: options.providerPlatform
  })

  this._callbackURL = options.callbackURL;
  this._lang = options.lang || 'en';
  this._state = options.state;
  this._scope = options.scope || 'snsapi_userinfo';
  this._passReqToCallback = options.passReqToCallback;
}

/**
 * Inherit from 'passort.Strategy'
 */
util.inherits(WechatStrategy, passport.Strategy);

WechatStrategy.prototype.authenticate = function (req, options) {
  if (!req._passport) {
    return this.error(new Error('passport.initialize() middleware not in use'));
  }

  var self = this;

  options = options || {};

  // 获取code,并校验相关参数的合法性
  // No code only state --> User has rejected send details. (Fail authentication request).
  if (req.query && req.query.state && !req.query.code) {
    return self.fail(401);
  }

  // Documentation states that if user rejects userinfo only state will be sent without code
  // In reality code equals "authdeny". Handle this case like the case above. (Fail authentication request).
  if (req.query && req.query.code === 'authdeny') {
    return self.fail(401);
  }

  // 获取code授权成功
  if (req.query && req.query.code) {
    var code = req.query.code;
    debug('wechat callback -> \n %s', req.url);

    self._oauth.getAccessToken(code, function (err, response) {
      // 校验完成信息
      function verified(err, user, info) {
        if (err) {
          return self.error(err);
        }
        if (!user) {
          return self.fail(info);
        }
        self.success(user, info);
      }

      if (err) {
        return self.error(err);
      }

      debug('fetch accessToken -> \n %s', JSON.stringify(response.data, null, ' '));

      var params = response.data;

      if (~params.scope.indexOf('snsapi_base')) {
        var profile = {
          openid: params['openid'],
          unionid: params['unionid']
        };

        try {
          if (self._passReqToCallback) {
            self._verify(req, params['access_token'], params['refresh_token'], profile, params['expires_in'], verified);
          } else {
            self._verify(params['access_token'], params['refresh_token'], profile, params['expires_in'], verified);
          }
        } catch (ex) {
          return self.error(ex);
        }
      } else {
        self._oauth.getUser({
          openid: params['openid'],
          lang: self._lang
        }, function (err, profile) {
          if (err) {
            debug('fetch userinfo by openid error ->', err.message);
            return self.error(err);
          }

          debug('fetch userinfo -> \n %s', JSON.stringify(profile, null, ' '));

          // merge params
          params = extend(params, profile);

          try {
            if (self._passReqToCallback) {
              self._verify(req, params['access_token'], params['refresh_token'], profile, params['expires_in'], verified);
            } else {
              self._verify(params['access_token'], params['refresh_token'], profile, params['expires_in'], verified);
            }
          } catch (ex) {
            return self.error(ex);
          }
        });
      }
    });
  } else {
    req = req.ctx ? req.ctx : req
    var defaultURL = req.protocol + '://' + req.get('Host') + req.originalUrl;
    var state = typeof options.state === 'function' ? options.state(req) : (options.state || self._state)
    var callbackURL = options.callbackURL || self._callbackURL || defaultURL;
    var scope = options.scope || self._scope;
    var client = typeof options.client === 'function' ? options.client(req) : (options.client || self._client)

    var methodName = client === 'wechat' ? 'getAuthorizeURL' : 'getAuthorizeURLForWebsite';
    var location = self._oauth[methodName](callbackURL, state, scope);

    debug('redirect -> \n%s', location);
    self.redirect(location, 302);
  }
};

module.exports = WechatStrategy;
