export const CATEGORIES = [
  {
    id: 'appliance',
    name: '家电',
    products: [
      {
        id: 'washer',
        name: '洗衣机',
        queryZh: '洗衣机 控制板 电路板',
        queryEn: 'washing machine PCB control board',
        brands: ['海尔', '美的', '小天鹅', '西门子', '松下', 'LG', '三星', '小米', '荣事达', '惠而浦']
      },
      {
        id: 'fridge',
        name: '冰箱',
        queryZh: '冰箱 控制板 电路板',
        queryEn: 'refrigerator PCB control board',
        brands: ['海尔', '美的', '容声', '西门子', '美菱', '海信', '松下', '博世']
      },
      {
        id: 'ac',
        name: '空调',
        queryZh: '空调 内外机 控制板 电路板',
        queryEn: 'air conditioner PCB control board',
        brands: ['格力', '美的', '海尔', '奥克斯', '海信', '大金', '松下', '小米', 'TCL']
      },
      {
        id: 'tv',
        name: '电视',
        queryZh: '液晶电视 电源板 主板',
        queryEn: 'LED TV power board mainboard PCB',
        brands: ['小米', '海信', '创维', 'TCL', '索尼', '三星', 'LG', '康佳']
      },
      {
        id: 'microwave',
        name: '微波炉',
        queryZh: '微波炉 控制板 电路板',
        queryEn: 'microwave oven PCB control board',
        brands: ['格兰仕', '美的', '松下', '东芝', 'LG']
      },
      {
        id: 'kettle',
        name: '热水壶',
        queryZh: '电热水壶 控制板 电路板',
        queryEn: 'electric kettle PCB control board',
        brands: ['美的', '苏泊尔', '九阳', '飞利浦', '小米', '虎牌', '象印', '北鼎']
      },
      {
        id: 'dispenser',
        name: '饮水机',
        queryZh: '饮水机 控制板 电路板',
        queryEn: 'water dispenser PCB control board',
        brands: ['美的', '安吉尔', '沁园', '海尔', '小米', '奥克斯', '碧云泉']
      },
      {
        id: 'dryer',
        name: '吹风机',
        queryZh: '电吹风 控制板 电路板',
        queryEn: 'hair dryer PCB control board',
        brands: ['飞科', '松下', '飞利浦', '小米', '徕芬', '康夫', '沙宣']
      }
    ]
  },
  {
    id: 'kitchen',
    name: '厨电热水',
    products: [
      {
        id: 'kettle',
        name: '热水壶',
        queryZh: '电热水壶 控制板 电路板',
        queryEn: 'electric kettle PCB control board',
        brands: ['美的', '苏泊尔', '九阳', '飞利浦', '小米', '虎牌', '象印', '北鼎']
      },
      {
        id: 'dispenser',
        name: '饮水机',
        queryZh: '饮水机 控制板 电路板',
        queryEn: 'water dispenser PCB control board',
        brands: ['美的', '安吉尔', '沁园', '海尔', '小米', '奥克斯', '碧云泉']
      },
      {
        id: 'rice',
        name: '电饭煲',
        queryZh: '电饭煲 控制板 电路板',
        queryEn: 'rice cooker PCB control board',
        brands: ['美的', '苏泊尔', '九阳', '松下', '虎牌', '象印']
      },
      {
        id: 'induction',
        name: '电磁炉',
        queryZh: '电磁炉 功率板 电路板',
        queryEn: 'induction cooker PCB power board',
        brands: ['美的', '苏泊尔', '九阳', '尚朋堂']
      },
      {
        id: 'hood',
        name: '油烟机',
        queryZh: '油烟机 控制板 电路板',
        queryEn: 'range hood PCB control board',
        brands: ['老板', '方太', '华帝', '美的', '海尔', '万和']
      },
      {
        id: 'dishwasher',
        name: '洗碗机',
        queryZh: '洗碗机 控制板 电路板',
        queryEn: 'dishwasher PCB control board',
        brands: ['美的', '海尔', '西门子', '方太', '老板']
      }
    ]
  },
  {
    id: 'personal',
    name: '个护生活',
    products: [
      {
        id: 'dryer',
        name: '吹风机',
        queryZh: '电吹风 控制板 电路板',
        queryEn: 'hair dryer PCB control board',
        brands: ['飞科', '松下', '飞利浦', '小米', '徕芬', '康夫', '沙宣']
      },
      {
        id: 'iron',
        name: '电熨斗',
        queryZh: '电熨斗 电路板',
        queryEn: 'electric iron PCB',
        brands: ['飞利浦', '松下', '飞科', '海尔']
      },
      {
        id: 'vacuum',
        name: '吸尘器',
        queryZh: '吸尘器 控制板 电路板',
        queryEn: 'vacuum cleaner PCB control board',
        brands: ['戴森', '小米', '美的', '科沃斯', '添可', '飞利浦']
      },
      {
        id: 'fan',
        name: '电风扇',
        queryZh: '电风扇 控制板 电路板',
        queryEn: 'electric fan PCB control board',
        brands: ['美的', '格力', '艾美特', '小米', '先锋']
      }
    ]
  },
  {
    id: 'power',
    name: '电源通信',
    products: [
      {
        id: 'adapter',
        name: '电源适配器',
        queryZh: '开关电源 适配器 电路板',
        queryEn: 'switching power supply adapter PCB',
        brands: ['航嘉', '台达', '全汉', '海韵', '长城']
      },
      {
        id: 'router',
        name: '路由器',
        queryZh: '路由器 主板 电路板',
        queryEn: 'wifi router PCB mainboard',
        brands: ['华为', '小米', 'TP-LINK', '华硕', '网件', '腾达']
      },
      {
        id: 'pcpsu',
        name: '电脑电源',
        queryZh: 'PC 电源 电路板',
        queryEn: 'PC ATX power supply PCB',
        brands: ['航嘉', '海韵', '振华', '长城', '酷冷至尊']
      }
    ]
  }
]

export const ALL_BRAND_VALUE = '__all__'

export function getCategory(id) {
  return CATEGORIES.find((item) => item.id === id) || CATEGORIES[0]
}

export function getProduct(categoryId, productId) {
  const category = getCategory(categoryId)
  return category.products.find((item) => item.id === productId) || category.products[0]
}
