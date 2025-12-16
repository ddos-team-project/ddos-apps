export const getApiUrl = () => {
  const randomId = Math.random().toString(36).slice(2, 10)
  return `https://${randomId}.tier1.ddos.io.kr`
}

export const getSeoulApiUrl = () => {
  const randomId = Math.random().toString(36).slice(2, 10)
  return `https://${randomId}.seoul.tier1.ddos.io.kr`
}

export const getTokyoApiUrl = () => {
  const randomId = Math.random().toString(36).slice(2, 10)
  return `https://${randomId}.tokyo.tier1.ddos.io.kr`
}
