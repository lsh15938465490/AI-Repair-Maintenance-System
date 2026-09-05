export const PROVIDERS = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    chatPath: '/v1/chat/completions',
    model: 'deepseek-chat',
    visionHint: '当前官方对话模型对图片支持有限，建议优先使用通义千问或 Kimi 视觉模型。'
  },
  {
    id: 'qwen',
    name: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    chatPath: '/chat/completions',
    model: 'qwen-vl-plus',
    visionHint: '推荐用于电路板图片识别。'
  },
  {
    id: 'kimi',
    name: 'Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    chatPath: '/chat/completions',
    model: 'moonshot-v1-8k-vision-preview',
    visionHint: '支持视觉理解，适合实拍图排查。'
  },
  {
    id: 'ernie',
    name: '文心一言',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    chatPath: '/chat/completions',
    model: 'ernie-4.5-turbo-vl',
    visionHint: '请使用千帆 API Key，并确保账号已开通视觉模型。'
  }
]

export function getProvider(id) {
  return PROVIDERS.find((item) => item.id === id) || PROVIDERS[0]
}
