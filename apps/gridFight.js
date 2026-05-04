import User from '../../genshin/model/user.js'
import MysSRApi from '../runtime/MysSRApi.js'
import setting from '../utils/setting.js'
import fetch from 'node-fetch'
import _ from 'lodash'
import { getCk, rulePrefix } from '../utils/common.js'
import runtimeRender from '../common/runtimeRender.js'
import GsCfg from '../../genshin/model/gsCfg.js'

export class GridFight extends plugin {
  constructor (e) {
    super({
      name: '星铁plugin-货币战争',
      dsc: '星穹铁道货币战争信息',
      event: 'message',
      priority: setting.getConfig('gachaHelp').noteFlag ? 5 : 500,
      rule: [
        {
          reg: `^${rulePrefix}(货币(战争)?|币战)$`,
          fnc: 'grid_fight'
        },
        {
          reg: `^${rulePrefix}(货币(战争)?|币战)(战绩|回顾)(一|二|三|四|五|六|七|八|九|十)?$`,
          fnc: 'grid_fight_archive'
        }
      ]
    })
    this.User = new User(e)
  }

  get app2config () {
    return setting.getConfig('cookieHelp')
  }

  async grid_fight (e) {
    this.e.isSr = true
    this.isSr = true
    let user = this.e.user_id
    let ats = e.message.filter(m => m.type === 'at')
    if (ats.length > 0 && !e.atBot) {
      user = ats[0].qq
      this.e.user_id = user
      this.User = new User(this.e)
    }
    let uid = e.msg.match(/\d+/)?.[0]
    await this.miYoSummerGetUid()
    uid = uid || (await redis.get(`STAR_RAILWAY:UID:${user}`)) || this.e.user?.getUid('sr')
    if (!uid) {
      return e.reply('未绑定uid，请发送#星铁绑定uid进行绑定')
    }
    let ck = await getCk(e)
    if (!ck || Object.keys(ck).filter(k => ck[k].ck).length === 0) {
      let ckArr = GsCfg.getConfig('mys', 'pubCk') || []
      ck = ckArr[0]
    }
    if (!ck) {
      await e.reply(`尚未绑定Cookie,${this.app2config.docs}`)
      return false
    }

    let api = new MysSRApi(uid, ck)
    let sdk = api.getUrl('getFp')
    let fpRes = await fetch(sdk.url, { headers: sdk.headers, method: 'POST', body: sdk.body })
    fpRes = await fpRes.json()
    let deviceFp = fpRes?.data?.device_fp
    if (deviceFp) {
      await redis.set(`STARRAIL:DEVICE_FP:${uid}`, deviceFp, { EX: 86400 * 7 })
    }

    const { url, headers } = api.getUrl('srGridFight', { deviceFp })
    delete headers['x-rpc-page']
    let res = await fetch(url, { headers })
    let cardData = await res.json()
    cardData = await api.checkCode(this.e, cardData, 'srGridFight', { deviceFp })
    if (cardData.retcode !== 0) {
      return false
    }

    let data = Object.assign(cardData.data, { uid })

    await runtimeRender(e, '/gridFight/gridFight.html', data, {
      scale: 1.4
    })
  }

  async grid_fight_archive (e) {
    this.e.isSr = true
    this.isSr = true
    let user = this.e.user_id
    let ats = e.message.filter(m => m.type === 'at')
    if (ats.length > 0 && !e.atBot) {
      user = ats[0].qq
      this.e.user_id = user
      this.User = new User(this.e)
    }
    let uid = e.msg.match(/\d+/)?.[0]
    await this.miYoSummerGetUid()
    uid = uid || (await redis.get(`STAR_RAILWAY:UID:${user}`)) || this.e.user?.getUid('sr')
    if (!uid) {
      return e.reply('未绑定uid，请发送#星铁绑定uid进行绑定')
    }
    let ck = await getCk(e)
    if (!ck || Object.keys(ck).filter(k => ck[k].ck).length === 0) {
      let ckArr = GsCfg.getConfig('mys', 'pubCk') || []
      ck = ckArr[0]
    }
    if (!ck) {
      await e.reply(`尚未绑定Cookie,${this.app2config.docs}`)
      return false
    }

    let indexMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
    let indexStr = e.msg.match(/(一|二|三|四|五|六|七|八|九|十)$/)?.[0]
    let index = indexMap[indexStr] || 1

    let api = new MysSRApi(uid, ck)
    let sdk = api.getUrl('getFp')
    let fpRes = await fetch(sdk.url, { headers: sdk.headers, method: 'POST', body: sdk.body })
    fpRes = await fpRes.json()
    let deviceFp = fpRes?.data?.device_fp
    if (deviceFp) {
      await redis.set(`STARRAIL:DEVICE_FP:${uid}`, deviceFp, { EX: 86400 * 7 })
    }

    const { url, headers } = api.getUrl('srGridFight', { deviceFp })
    delete headers['x-rpc-page']
    let res = await fetch(url, { headers })
    let cardData = await res.json()
    cardData = await api.checkCode(this.e, cardData, 'srGridFight', { deviceFp })
    if (cardData.retcode !== 0) {
      return false
    }

    let data = cardData.data
    if (!data.grid_fight_archive_list || data.grid_fight_archive_list.length < index) {
      return e.reply(`未找到货币战争第${index}条记录`)
    }

    let record = data.grid_fight_archive_list[index - 1]

    // Prepare damage data
    let damageData = []
    if (record.lineup.damage_list) {
      // Create a map for quick lookup
      let entityMap = {}
      record.lineup.front_roles.forEach(r => { entityMap[r.avatar_id] = r })
      record.lineup.back_roles.forEach(r => { entityMap[r.avatar_id] = r })
      record.lineup.trait_list.forEach(t => { entityMap[t.trait_id] = t })

      damageData = record.lineup.damage_list.map(d => {
        let entity = entityMap[d.id] || {}
        return {
          id: d.id,
          damage: parseFloat(d.damage),
          type: d.damage_type,
          entity: entity
        }
      }).sort((a, b) => b.damage - a.damage).slice(0, 5)

      // Calculate percentage for bars
      if (damageData.length > 0) {
        let maxDamage = damageData[0].damage
        damageData.forEach(d => {
          d.percent = maxDamage > 0 ? (d.damage / maxDamage * 100).toFixed(2) : 0
          // Format damage numbers
          if (d.damage >= 10000) {
            d.damageStr = (d.damage / 10000).toFixed(1) + '万'
          } else {
            d.damageStr = d.damage.toFixed(0)
          }
        })
      }
    }

    let renderData = {
      uid,
      grid_fight_brief: data.grid_fight_brief,
      record: record,
      index_of_archive: `${index} / ${data.grid_fight_archive_list.length}`,
      damageData: damageData
    }

    await runtimeRender(e, '/gridFight/gridFightArchive.html', renderData, {
      scale: 1.4
    })
  }

  async miYoSummerGetUid () {
    let key = `STAR_RAILWAY:UID:${this.e.user_id}`
    let ck = await getCk(this.e)
    if (!ck) return false
    let api = new MysSRApi('', ck)
    let userData = await api.getData('srUser')
    if (!userData?.data || _.isEmpty(userData.data.list)) return false
    userData = userData.data.list[0]
    let { game_uid: gameUid } = userData
    await redis.set(key, gameUid)
    await redis.setEx(
        `STAR_RAILWAY:userData:${gameUid}`,
        60 * 60,
        JSON.stringify(userData)
    )
    return userData
  }
}
