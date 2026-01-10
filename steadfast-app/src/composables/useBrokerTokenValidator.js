import axios from 'axios'
import { tokenStatus, supportedBrokers, BASE_URL } from '@/stores/globalStore'

const flattradeFundLimits = async () => {
  const jKey = localStorage.getItem('FLATTRADE_API_TOKEN')

  // Find the Flattrade broker details
  let clientId = null
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith('broker_Flattrade_')) {
      const brokerDetails = JSON.parse(localStorage.getItem(key))
      clientId = brokerDetails.clientId
      break
    }
  }

  if (!jKey || !clientId) {
    throw new Error('Token or client ID is missing for Flattrade.')
  }

  const jData = JSON.stringify({ uid: clientId, actid: clientId })
  const payload = `jKey=${jKey}&jData=${jData}`

  try {
    const res = await axios.post('https://piconnect.flattrade.in/PiConnectTP/Limits', payload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return res.data
  } catch (error) {
    throw new Error('Error fetching Flattrade fund limits: ' + error.message)
  }
}

const shoonyaFundLimits = async () => {
  const jKey = localStorage.getItem('SHOONYA_API_TOKEN')

  // Find the Shoonya broker details
  let clientId = null
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith('broker_Shoonya_')) {
      const brokerDetails = JSON.parse(localStorage.getItem(key))
      clientId = brokerDetails.clientId
      break
    }
  }

  if (!jKey || !clientId) {
    throw new Error('Token or client ID is missing for Shoonya.')
  }

  const jData = JSON.stringify({ uid: clientId, actid: clientId })
  const payload = `jKey=${jKey}&jData=${jData}`

  try {
    const res = await axios.post('https://api.shoonya.com/NorenWClientTP/Limits', payload, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    return res.data
  } catch (error) {
    throw new Error('Error fetching Shoonya fund limits: ' + error.message)
  }
}
const kotakNeoFundLimits = async () => {
  const accessToken = localStorage.getItem('KOTAKNEO_API_TOKEN')
  const sid = localStorage.getItem('KOTAKNEO_SID')
  const baseUrl = localStorage.getItem('KOTAKNEO_BASE_URL')
  const serverId = localStorage.getItem('KOTAKNEO_SERVER_ID')

  let clientId = null
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith('broker_KotakNeo_')) {
      const brokerDetails = JSON.parse(localStorage.getItem(key))
      clientId = brokerDetails.clientId
      break
    }
  }

  if (!accessToken || !sid || !clientId || !baseUrl) {
    // Gracefully handle missing credentials
    return;
  }

  try {
    const res = await axios.post(`${BASE_URL}/kotakneo/fundLimit?accessToken=${accessToken}&sid=${sid}&userId=${clientId}&baseUrl=${encodeURIComponent(baseUrl)}&serverId=${encodeURIComponent(serverId || '')}`)
    return res.data
  } catch (error) {
    throw new Error('Error fetching Kotak Neo fund limits: ' + error.message)
  }
}

const validateToken = async (brokerName) => {
  try {
    switch (brokerName) {
      case 'Flattrade':
        await flattradeFundLimits()
        tokenStatus.Flattrade = 'valid'
        break
      case 'Shoonya':
        await shoonyaFundLimits()
        tokenStatus.Shoonya = 'valid'
        break
      case 'KotakNeo':
        await kotakNeoFundLimits()
        tokenStatus.KotakNeo = 'valid'
        break
      default:
        throw new Error('Invalid broker name')
    }
  } catch (error) {
    console.error(`Error validating token for ${brokerName}:`, error)
    tokenStatus[brokerName] = 'invalid'
  }
}

const checkAllTokens = async () => {
  for (const broker of supportedBrokers) {
    await validateToken(broker)
  }
}

const getBrokerStatus = (brokerName) => {
  // Find the broker details
  let brokerDetails = null
  let brokerToken = null
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key.startsWith(`broker_${brokerName}_`)) {
      brokerDetails = JSON.parse(localStorage.getItem(key))
      brokerToken = localStorage.getItem(`${brokerName.toUpperCase()}_API_TOKEN`)
      break
    }
  }

  if (!brokerDetails) {
    return 'Broker not found'
  }

  if (!brokerToken) {
    return 'Token missing'
  } else {
    return tokenStatus[brokerName] || 'unknown'
  }
}

export { validateToken, checkAllTokens, getBrokerStatus, tokenStatus }
