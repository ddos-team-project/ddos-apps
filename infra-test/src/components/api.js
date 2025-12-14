export const getApiUrl = () => {
  const randomId = Math.random().toString(36).slice(2, 10)
  return `https://${randomId}.tier1.ddos.io.kr`
}
