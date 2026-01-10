import { selectedBroker } from '@/stores/globalStore'
import axios from 'axios'

import {
  BASE_URL,
  flatTradePositionBook,
  shoonyaPositionBook,
  positionSecurityIds,
  socket,
  defaultCallSecurityId,
  defaultPutSecurityId,
  currentSubscriptions,
  toastMessage,
  showToast,
  flatOrderBook,
  flatTradeBook,
  shoonyaOrderBook,
  shoonyaTradeBook,
  kotakNeoOrderBook,
  kotakNeoTradeBook,
  kotakNeoPositionBook,
  fundLimits,
  callStrikes,
  putStrikes,
  enableStoploss,
  enableTarget
} from '@/stores/globalStore'

// Trade Configuration Composables
import { getExchangeSegment } from '@/composables/useTradeConfiguration'

// Real Time LTP Data Composables
import { subscribeToLTP } from '@/composables/useMarketData'

// WebSocket Composables
import { subscribeToOptions, subscribeToPositionLTPs } from '@/composables/useWebSocket'

// Risk Management Composables
import { setStoploss, setTarget } from '@/composables/useRiskManagement'

export const updateFundLimits = async () => {
  await fetchFundLimit()
  // console.log('Updated Fund Limits:', fundLimits.value);
}
export const fetchFundLimit = async () => {
  try {
    if (!selectedBroker.value) {
      throw new Error('No broker selected')
    }

    let response
    if (selectedBroker.value?.brokerName === 'Flattrade') {
      const FLATTRADE_API_TOKEN = localStorage.getItem('FLATTRADE_API_TOKEN')
      if (!FLATTRADE_API_TOKEN) {
        throw new Error('Flattrade API Token is missing')
      }
      response = await axios.post(`${BASE_URL}/flattrade/fundLimit`, null, {
        params: {
          FLATTRADE_API_TOKEN,
          FLATTRADE_CLIENT_ID: selectedBroker.value.clientId
        }
      })
      fundLimits.value = {
        cash: response.data.cash,
        payin: response.data.payin,
        marginused: response.data.marginused
      }
    } else if (selectedBroker.value?.brokerName === 'Shoonya') {
      const SHOONYA_API_TOKEN = localStorage.getItem('SHOONYA_API_TOKEN')
      if (!SHOONYA_API_TOKEN) {
        throw new Error('Shoonya API Token is missing')
      }
      response = await axios.post(`${BASE_URL}/shoonya/fundLimit`, null, {
        params: {
          SHOONYA_API_TOKEN,
          SHOONYA_CLIENT_ID: selectedBroker.value.clientId
        }
      })
      // Make sure the response data has the correct structure
      fundLimits.value = {
        cash: response.data.cash,
        payin: response.data.payin,
        marginused: response.data.marginused
        // Add any other relevant fields from the Shoonya response
      }
    } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
      const accessToken = localStorage.getItem('KOTAKNEO_API_TOKEN')
      const sid = localStorage.getItem('KOTAKNEO_SID')
      const baseUrl = localStorage.getItem('KOTAKNEO_BASE_URL')

      if (!accessToken || !sid || !baseUrl) {
        throw new Error('Kotak Neo API Token, SID or baseUrl is missing')
      }
      response = await axios.post(`${BASE_URL}/kotakneo/fundLimit`, null, {
        params: {
          accessToken,
          sid,
          userId: selectedBroker.value.clientId,
          baseUrl,
          serverId: localStorage.getItem('KOTAKNEO_SERVER_ID'),
          consumerKey: localStorage.getItem('KOTAKNEO_CONSUMER_KEY') === 'undefined' ? '' : localStorage.getItem('KOTAKNEO_CONSUMER_KEY')
        }
      })
      // Adjust according to actual Kotak Neo response structure
      fundLimits.value = {
        cash: response.data.data?.find((m) => m.segment === 'ALL')?.marginAvailable || 0,
        payin: 0,
        marginused: response.data.data?.find((m) => m.segment === 'ALL')?.marginUsed || 0
      }
    } else {
      throw new Error('Unsupported broker')
    }
    // fundLimits.value = response.data;
  } catch (error) {
    console.error('Failed to fetch fund limits:', error)
  }
}

export const fetchFlattradeOrdersTradesBook = async () => {
  let jKey = localStorage.getItem('FLATTRADE_API_TOKEN') || token.value

  if (!selectedBroker.value || selectedBroker.value?.brokerName !== 'Flattrade') {
    toastMessage.value = 'Flattrade broker is not selected.'
    showToast.value = true
    return
  }

  const clientId = selectedBroker.value.clientId

  if (!jKey || !clientId) {
    toastMessage.value = 'Token or Client ID is missing. Please generate a token first.'
    showToast.value = true
    return
  }

  try {
    const response = await axios.get(`${BASE_URL}/flattrade/getOrdersAndTrades`, {
      params: {
        FLATTRADE_API_TOKEN: jKey,
        FLATTRADE_CLIENT_ID: clientId
      }
    })

    flatOrderBook.value = response.data.orderBook
    flatTradeBook.value = response.data.tradeBook
    // console.log('Flattrade Order Book:', response.data.orderBook);
    // console.log('Flattrade Trade Book:', response.data.tradeBook);
  } catch (error) {
    toastMessage.value = 'Error fetching trades: ' + error.message
    showToast.value = true
    console.error('Error fetching trades:', error)
  }
}
export const fetchShoonyaOrdersTradesBook = async () => {
  let jKey = localStorage.getItem('SHOONYA_API_TOKEN') || token.value

  if (!selectedBroker.value || selectedBroker.value?.brokerName !== 'Shoonya') {
    toastMessage.value = 'Shoonya broker is not selected.'
    showToast.value = true
    return
  }

  const clientId = selectedBroker.value.clientId

  if (!jKey || !clientId) {
    toastMessage.value = 'Token or Client ID is missing. Please generate a token first.'
    showToast.value = true
    return
  }

  try {
    const response = await axios.get(`${BASE_URL}/shoonya/getOrdersAndTrades`, {
      params: {
        SHOONYA_API_TOKEN: jKey,
        SHOONYA_CLIENT_ID: clientId
      }
    })

    shoonyaOrderBook.value = response.data.orderBook
    shoonyaTradeBook.value = response.data.tradeBook
    // console.log('Shoonya Order Book:', response.data.orderBook);
    // console.log('Shoonya Trade Book:', response.data.tradeBook);
  } catch (error) {
    toastMessage.value = 'Error fetching trades: ' + error.message
    showToast.value = true
    console.error('Error fetching trades:', error)
  }
}
export const fetchKotakNeoOrdersTradesBook = async () => {
  let accessToken = localStorage.getItem('KOTAKNEO_API_TOKEN')
  let sid = localStorage.getItem('KOTAKNEO_SID')

  if (!selectedBroker.value || selectedBroker.value?.brokerName !== 'KotakNeo') {
    toastMessage.value = 'Kotak Neo broker is not selected.'
    showToast.value = true
    return
  }

  const clientId = selectedBroker.value.clientId
  const baseUrl = localStorage.getItem('KOTAKNEO_BASE_URL')

  if (!accessToken || !sid || !clientId || !baseUrl) {
    toastMessage.value = 'Token, SID, Client ID or baseUrl is missing. Please generate a token first.'
    showToast.value = true
    return
  }

  try {
    const response = await axios.get(`${BASE_URL}/kotakneo/getOrdersAndTrades`, {
      params: {
        accessToken,
        sid,
        userId: clientId,
        baseUrl,
        serverId: localStorage.getItem('KOTAKNEO_SERVER_ID'),
        consumerKey: localStorage.getItem('KOTAKNEO_CONSUMER_KEY')
      }
    })

    kotakNeoOrderBook.value = response.data.orderBook || []
    kotakNeoTradeBook.value = response.data.tradeBook || []
  } catch (error) {
    toastMessage.value =
      'Error fetching Kotak Neo trades: ' + (error.response?.data?.message || error.message)
    showToast.value = true
    console.error('Error fetching Kotak Neo trades:', error)
  }
}
export const updatePositionSecurityIds = () => {
  flatTradePositionBook.value.forEach((position) => {
    if (position.tsym && !positionSecurityIds.value[position.tsym]) {
      positionSecurityIds.value[position.tsym] = position.token
    }
  })
  // Add this block for Shoonya positions
  shoonyaPositionBook.value.forEach((position) => {
    if (position.tsym && !positionSecurityIds.value[position.tsym]) {
      positionSecurityIds.value[position.tsym] = position.token
    }
  })
  kotakNeoPositionBook.value.forEach((position) => {
    if (position.tsym && !positionSecurityIds.value[position.tsym]) {
      positionSecurityIds.value[position.tsym] = position.token
    }
  })
}
export const fetchFlattradePositions = async () => {
  let jKey = localStorage.getItem('FLATTRADE_API_TOKEN') || token.value

  if (!jKey) {
    toastMessage.value = 'Token is missing. Please generate a token first.'
    showToast.value = true
    return
  }

  if (!selectedBroker.value || selectedBroker.value?.brokerName !== 'Flattrade') {
    toastMessage.value = 'Flattrade broker is not selected.'
    showToast.value = true
    return
  }

  const clientId = selectedBroker.value.clientId

  const positionBookPayload = `jKey=${jKey}&jData=${JSON.stringify({ uid: clientId, actid: clientId })}`

  try {
    const positionBookRes = await axios.post(
      'https://piconnect.flattrade.in/PiConnectTP/PositionBook',
      positionBookPayload,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    if (
      Array.isArray(positionBookRes.data) &&
      positionBookRes.data.every((item) => item.stat === 'Ok')
    ) {
      flatTradePositionBook.value = positionBookRes.data
      // console.log('Flattrade Position Book:', positionBookRes.data);
      updatePositionSecurityIds()
      subscribeToPositionLTPs()
      subscribeToOptions()

      // Automatically apply predefined stoplosses and targets to positions
      // Automatically apply predefined stoplosses and targets to positions
      applyPredefinedRiskManagement(flatTradePositionBook.value)
    } else if (
      positionBookRes.data.emsg === 'no data' ||
      positionBookRes.data.emsg.includes('no data')
    ) {
      flatTradePositionBook.value = []
      // console.log('No positions in Flattrade Position Book');
    } else {
      const errorMsg = positionBookRes.data.emsg || 'Unknown error'
      console.error('Error fetching position book:', errorMsg)
      flatTradePositionBook.value = []
    }
  } catch (error) {
    console.error('Error fetching position book:', error)
    flatTradePositionBook.value = []
  }
}
export const fetchShoonyaPositions = async () => {
  let jKey = localStorage.getItem('SHOONYA_API_TOKEN') || token.value

  if (!jKey) {
    toastMessage.value = 'Token is missing. Please generate a token first.'
    showToast.value = true
    return
  }

  if (!selectedBroker.value || selectedBroker.value?.brokerName !== 'Shoonya') {
    toastMessage.value = 'Shoonya broker is not selected.'
    showToast.value = true
    return
  }

  const clientId = selectedBroker.value.clientId

  const positionBookPayload = `jKey=${jKey}&jData=${JSON.stringify({ uid: clientId, actid: clientId })}`

  try {
    const positionBookRes = await axios.post(
      'https://api.shoonya.com/NorenWClientTP/PositionBook',
      positionBookPayload,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    )

    if (
      Array.isArray(positionBookRes.data) &&
      positionBookRes.data.every((item) => item.stat === 'Ok')
    ) {
      shoonyaPositionBook.value = positionBookRes.data
      // console.log('Shoonya Position Book:', positionBookRes.data);
      updatePositionSecurityIds()
      subscribeToPositionLTPs()
      subscribeToOptions()

      // Automatically apply predefined stoplosses and targets to positions
      applyPredefinedRiskManagement(shoonyaPositionBook.value)
    } else if (
      positionBookRes.data.emsg === 'no data' ||
      positionBookRes.data.emsg.includes('no data')
    ) {
      shoonyaPositionBook.value = []
      // console.log('No positions in Shoonya Position Book');
    } else {
      const errorMsg = positionBookRes.data.emsg || 'Unknown error'
      console.error('Error fetching position book:', errorMsg)
      shoonyaPositionBook.value = []
    }
  } catch (error) {
    console.error('Error fetching position book:', error)
    shoonyaPositionBook.value = []
  }
}
export const fetchKotakNeoPositions = async () => {
  let accessToken = localStorage.getItem('KOTAKNEO_API_TOKEN')
  let sid = localStorage.getItem('KOTAKNEO_SID')

  if (!accessToken || !sid) {
    toastMessage.value = 'Token or SID is missing. Please generate a token first.'
    showToast.value = true
    return
  }

  if (!selectedBroker.value || selectedBroker.value?.brokerName !== 'KotakNeo') {
    toastMessage.value = 'Kotak Neo broker is not selected.'
    showToast.value = true
    return
  }

  const clientId = selectedBroker.value.clientId
  const baseUrl = localStorage.getItem('KOTAKNEO_BASE_URL')

  try {
    const response = await axios.get(`${BASE_URL}/kotakneo/getPositions`, {
      params: {
        accessToken,
        sid,
        userId: clientId,
        baseUrl,
        serverId: localStorage.getItem('KOTAKNEO_SERVER_ID'),
        consumerKey: localStorage.getItem('KOTAKNEO_CONSUMER_KEY')
      }
    });

    if (response.data.data) {
      kotakNeoPositionBook.value = response.data.data
      updatePositionSecurityIds()
      subscribeToPositionLTPs()
      subscribeToOptions()
      applyPredefinedRiskManagement(kotakNeoPositionBook.value)
    } else {
      kotakNeoPositionBook.value = []
    }
  } catch (error) {
    console.error('Error fetching Kotak Neo positions:', error)
    kotakNeoPositionBook.value = []
  }
}

export const updateOrdersAndPositions = async () => {
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    await Promise.all([fetchFlattradeOrdersTradesBook(), fetchFlattradePositions()])
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    await Promise.all([fetchShoonyaOrdersTradesBook(), fetchShoonyaPositions()])
  } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
    await Promise.all([fetchKotakNeoOrdersTradesBook(), fetchKotakNeoPositions()])
  }
}

// Apply predefined risk management rules to positions
export const applyPredefinedRiskManagement = (positions) => {
  if (!positions || positions.length === 0) return

  // Check if global features are enabled
  const stoplossEnabled = enableStoploss.value
  const targetEnabled = enableTarget.value

  if (!stoplossEnabled && !targetEnabled) return

  positions.forEach(position => {
    const qty = parseInt(position.netqty || position.netQty)

    // Skip positions with zero quantity
    if (qty === 0) return

    // Check if position already has stoploss or target set
    // If not, apply the predefined values
    // console.log(`Applying predefined risk management for position: ${position.tsym}`)

    // Apply stoploss
    if (stoplossEnabled) {
      setStoploss(position, 'static')
    }

    // Apply target
    if (targetEnabled) {
      setTarget(position)
    }
  })
}

// Set up periodic refresh for orders and trades
export const setupPeriodicOrderRefresh = () => {
  // Refresh orders and trades every 10 seconds
  const refreshInterval = 10000

  // Create and return the interval
  return setInterval(async () => {
    if (!selectedBroker.value?.brokerName) return

    try {
      console.log('Auto-refreshing orders and trades')
      if (selectedBroker.value?.brokerName === 'Flattrade') {
        await fetchFlattradeOrdersTradesBook()
      } else if (selectedBroker.value?.brokerName === 'Shoonya') {
        await fetchShoonyaOrdersTradesBook()
      } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
        await fetchKotakNeoOrdersTradesBook()
      }
    } catch (error) {
      console.error('Error auto-refreshing orders:', error)
    }
  }, refreshInterval)
}

export const findNewPosition = (tradingSymbol) => {
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    return flatTradePositionBook.value.find((p) => p.tsym === tradingSymbol)
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    return shoonyaPositionBook.value.find((p) => p.tsym === tradingSymbol)
  } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
    return kotakNeoPositionBook.value.find((p) => p.tsym === tradingSymbol)
  }
  return null
}

export const getSymbol = (position) => {
  return position.tsym || position.tradingSymbol || ''
}
