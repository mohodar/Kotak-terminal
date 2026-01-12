import { ref } from 'vue'
import axios from 'axios'
import qs from 'qs'

// Global State
import {
  BASE_URL,
  selectedCallStrike,
  selectedPutStrike,
  quantities,
  selectedMasterSymbol,
  selectedOrderType,
  selectedQuantity,
  selectedBroker,
  selectedProductType,
  toastMessage,
  showToast,
  flatTradePositionBook,
  shoonyaPositionBook,
  flatOrderBook,
  shoonyaOrderBook,
  kotakNeoOrderBook,
  kotakNeoPositionBook,
  selectedExchange,
  enableStoploss,
  enableTarget,
  stoplossValue,
  targetValue,
  limitPrice,
  triggerPrice,
  selectedFlattradePositionsSet,
  selectedShoonyaPositionsSet,
  selectedKotakNeoPositionsSet,
  paperTradingMode,
  sellerMode
} from '@/stores/globalStore'

// Trade Configuration Composables
import { getExchangeSegment, getProductTypeValue } from '@/composables/useTradeConfiguration'

// Order Management Composables
import { selectedLots, getTransactionType } from '@/composables/useTradeConfiguration'

// Portfolio Management Composables
import {
  updateOrdersAndPositions,
  updateFundLimits,
  findNewPosition,
  getSymbol,
  fetchFlattradeOrdersTradesBook,
  fetchShoonyaOrdersTradesBook,
  fetchKotakNeoOrdersTradesBook
} from '@/composables/usePositionManagement'

// Risk Management Composables
import { setStoploss, setTarget } from '@/composables/useRiskManagement'

export const prepareOrderPayload = (
  transactionType,
  drvOptionType,
  selectedStrike,
  exchangeSegment,
  overrideOrderType = null
) => {
  let price = '0'
  let priceType = 'MKT'
  const orderType = overrideOrderType || selectedOrderType.value;

  // Kotak Neo uses different price type codes
  const isKotakNeo = selectedBroker.value?.brokerName === 'KotakNeo';

  switch (orderType) {
    case 'LMT':
      price = limitPrice.value.toString()
      priceType = isKotakNeo ? 'L' : 'LMT'
      break
    case 'SL_LMT':
      price = limitPrice.value.toString()
      priceType = isKotakNeo ? 'SL' : 'SL-LMT'
      break
  }

  const commonPayload = {
    uid: selectedBroker.value.clientId,
    actid: selectedBroker.value.clientId,
    exch: exchangeSegment,
    tsym: selectedStrike.tradingSymbol,
    qty: selectedQuantity.value.toString(),
    prc: price,
    prd: getProductTypeValue(selectedProductType.value),
    trantype: getTransactionType(transactionType),
    prctyp: priceType,
    ret: 'DAY',
    ordersource: 'API'
  }

  if (orderType === 'SL_LMT') {
    commonPayload.trgprc = triggerPrice.value.toString()
  }

  switch (selectedBroker.value?.brokerName) {
    case 'Flattrade':
      return {
        ...commonPayload
        // Add any additional fields specific to Flattrade here
      }
    case 'Shoonya':
      return {
        ...commonPayload
        // Add any additional fields specific to Shoonya here
      }
    case 'KotakNeo':
      const segmentMap = {
        'NSE': 'nse_cm',
        'BSE': 'bse_cm',
        'NFO': 'nse_fo',
        'BFO': 'bse_fo'
      };
      return {
        // Kotak Neo v2 API field names (exact match to documentation)
        "am": "NO",
        "dq": "0",
        "es": segmentMap[exchangeSegment] || exchangeSegment,
        "mp": "0",
        "pc": getProductTypeValue(selectedProductType.value),
        "pf": "N",
        "pr": price,
        "pt": priceType,
        "qt": selectedQuantity.value.toString(),
        "rt": "DAY",
        "tk": selectedStrike.securityId.toString(),
        "tp": orderType === 'SL_LMT' ? triggerPrice.value.toString() : "0",
        "ts": selectedStrike.tradingSymbol,
        "tt": transactionType === 'BUY' ? 'B' : 'S'
      }
    default:
      throw new Error('Unsupported broker')
  }
}
// Function to simulate paper trading order placement
const simulatePaperTradeOrder = async (orderData, transactionType, drvOptionType, selectedStrike, lotsToPlace, quantityToPlace) => {
  // Create a simulated response that mimics a successful order
  const simulatedOrderId = 'PAPER_' + Date.now() + '_' + Math.floor(Math.random() * 1000);

  // Create a simulated response object
  const simulatedResponse = {
    data: {
      stat: 'Ok',
      norenordno: simulatedOrderId,
      request_time: new Date().toISOString()
    }
  };

  console.log(`[PAPER TRADING] Simulated order for ${lotsToPlace} lots (${quantityToPlace} quantity)`);
  console.log('[PAPER TRADING] Order details:', orderData);

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 300));

  return simulatedResponse;
};

export const placeOrder = async (transactionType, drvOptionType, overrideStrike = null, overrideOrderType = null, skipUpdates = false, overrideLots = null) => {
  try {
    let selectedStrike =
      overrideStrike || (drvOptionType === 'CALL' ? selectedCallStrike.value : selectedPutStrike.value)

    if (!selectedStrike || !selectedStrike.tradingSymbol || !selectedStrike.securityId) {
      throw new Error(`Selected ${drvOptionType.toLowerCase()} strike is not properly defined`)
    }

    const exchangeSegment = getExchangeSegment()
    const instrument = quantities.value[selectedMasterSymbol.value]
    const freezeLimit = instrument.freezeLimit
    const orderLots = overrideLots !== null ? overrideLots : selectedLots.value
    const fullOrderQuantity = orderLots * instrument.lotSize

    let remainingLots = orderLots
    let placedLots = 0

    while (remainingLots > 0) {
      const lotsToPlace = Math.min(remainingLots, freezeLimit)
      const quantityToPlace = lotsToPlace * instrument.lotSize

      const orderData = prepareOrderPayload(
        transactionType,
        drvOptionType,
        selectedStrike,
        exchangeSegment,
        overrideOrderType
      )
      const isKotakNeo = selectedBroker.value?.brokerName === 'KotakNeo'
      if (isKotakNeo) {
        orderData.qt = quantityToPlace.toString()
      } else {
        orderData.qty = quantityToPlace.toString()
      }

      // Handle dynamic price updates for LMT_LTP, but respect overrideOrderType
      // If overrideOrderType is MKT, we shouldn't be using LMT_LTP logic
      const currentOrderType = overrideOrderType || selectedOrderType.value;
      if (['LMT_LTP'].includes(currentOrderType)) {
        const currentLTP = getCurrentLTP()
        orderData.prc = currentLTP.toString()
      }

      let response;

      // Check if paper trading mode is enabled
      if (paperTradingMode.value) {
        // Simulate paper trading order
        response = await simulatePaperTradeOrder(
          orderData,
          transactionType,
          drvOptionType,
          selectedStrike,
          lotsToPlace,
          quantityToPlace
        );

        // Add a visual indicator that this is a paper trade
        toastMessage.value = `[PAPER TRADE] Order placed for ${lotsToPlace} lots`;
      } else {
        // Real trading - proceed with actual API calls
        if (selectedBroker.value?.brokerName === 'Flattrade') {
          const FLATTRADE_API_TOKEN = localStorage.getItem('FLATTRADE_API_TOKEN')
          const payload = qs.stringify(orderData)
          response = await axios.post(`${BASE_URL}/flattrade/placeOrder`, payload, {
            headers: {
              Authorization: `Bearer ${FLATTRADE_API_TOKEN}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          })
        } else if (selectedBroker.value?.brokerName === 'Shoonya') {
          const SHOONYA_API_TOKEN = localStorage.getItem('SHOONYA_API_TOKEN')
          const payload = qs.stringify(orderData)
          response = await axios.post(`${BASE_URL}/shoonya/placeOrder`, payload, {
            headers: {
              Authorization: `Bearer ${SHOONYA_API_TOKEN}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          })
        } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
          const accessToken = localStorage.getItem('KOTAKNEO_API_TOKEN')
          const sid = localStorage.getItem('KOTAKNEO_SID')
          const baseUrl = localStorage.getItem('KOTAKNEO_BASE_URL')
          response = await axios.post(`${BASE_URL}/kotakneo/placeOrder`, orderData, {
            headers: {
              Authorization: accessToken,
              sid: sid,
              baseurl: baseUrl,
              serverid: localStorage.getItem('KOTAKNEO_SERVER_ID'),
              consumerkey: localStorage.getItem('KOTAKNEO_CONSUMER_KEY'),
              userid: selectedBroker.value.clientId,
              'Content-Type': 'application/json'
            }
          })
        }
      }

      console.log(`Placed order for ${lotsToPlace} lots (${quantityToPlace} quantity)`)
      console.log('Order placed successfully:', response.data)
      remainingLots -= lotsToPlace
      placedLots += lotsToPlace

      // Add a small delay between orders for LMT_LTP to get updated LTP
      if (['LMT_LTP'].includes(currentOrderType)) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    console.log(
      `All orders placed successfully. Total: ${placedLots} lots (${fullOrderQuantity} quantity)`
    )

    if (!paperTradingMode.value) {
      toastMessage.value = `Order(s) placed successfully for ${placedLots} lots`
    }
    showToast.value = true

    if (skipUpdates) {
      console.log('Skipping post-order updates and delays as requested.');
      return;
    }

    // Add a delay (4 seconds) before fetching updated data and applying risk management
    // as requested by the user to ensure position data and LTP are ready.
    await new Promise((resolve) => setTimeout(resolve, 4000))

    // Update both orders and positions
    await updateOrdersAndPositions()

    // Force update orders regardless of active tab
    const brokerName = selectedBroker.value?.brokerName
    if (brokerName === 'Flattrade') {
      await fetchFlattradeOrdersTradesBook()
    } else if (brokerName === 'Shoonya') {
      await fetchShoonyaOrdersTradesBook()
    } else if (brokerName === 'KotakNeo') {
      await fetchKotakNeoOrdersTradesBook()
    }

    // Add another small delay to ensure positions are fully updated
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Find the new position after updating positions
    const newPosition = findNewPosition(selectedStrike.tradingSymbol)

    console.log('Applying auto risk management for position:', newPosition ? newPosition.tsym : 'Position not found')

    // Check if we should apply risk management
    // In Seller Mode, apply only to SELL orders (skip for Hedge Buy orders)
    const shouldApplyRiskManagement = !sellerMode.value || transactionType === 'SELL';

    if (shouldApplyRiskManagement) {
      // If predefined stoploss is enabled, set stoploss for the new position
      if (enableStoploss.value && newPosition) {
        console.log(`Applying auto stoploss with value: ${stoplossValue.value}`)
        setStoploss(newPosition, 'static')
      }

      // If predefined target is enabled, set target for the new position
      if (enableTarget.value && newPosition) {
        console.log(`Applying auto target with value: ${targetValue.value}`)
        setTarget(newPosition)
      }
    }

    // Update fund limits
    await updateFundLimits()
  } catch (error) {
    console.error('Error placing order:', error)
    if (error.response?.data?.message) {
      const firstThreeWords = error.response.data.message.split(' ').slice(0, 3).join(' ')
      toastMessage.value = firstThreeWords
    } else {
      toastMessage.value = 'Failed to place order unfortunately'
    }
    showToast.value = true
  }
}
export const placeOrderForPosition = async (
  transactionType,
  optionType,
  position,
  overrideOrderType = null,
  overrideTriggerPrice = null
) => {
  try {
    const quantity = Math.abs(Number(position.netQty || position.netqty))
    const instrument = quantities.value[selectedMasterSymbol.value]
    const freezeLimit = instrument.freezeLimit * instrument.lotSize

    if (quantity === 0) {
      console.log('Quantity is zero, no order will be placed.')
      return
    }

    let remainingQuantity = quantity
    let placedQuantity = 0

    while (remainingQuantity > 0) {
      const quantityToPlace = Math.min(remainingQuantity, freezeLimit)

      let orderData
      if (
        selectedBroker.value?.brokerName === 'Flattrade' ||
        selectedBroker.value?.brokerName === 'Shoonya'
      ) {
        orderData = {
          uid: selectedBroker.value.clientId,
          actid: selectedBroker.value.clientId,
          exch: selectedExchange.value === 'NFO' ? 'NFO' : 'BFO',
          tsym: position.tsym,
          qty: quantityToPlace.toString(),
          prc: '0',
          prd: position.prd,
          trantype: transactionType,
          prctyp: overrideOrderType || 'MKT',
          ret: 'DAY'
        }
        if (overrideOrderType === 'SL-LMT') {
          orderData.trgprc = overrideTriggerPrice.toString()
        }
      } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
        const orderType = overrideOrderType === 'SL-LMT' ? 'SL' : (overrideOrderType || 'MKT')
        // Use position's exchange if available, otherwise fall back to getExchangeSegment()
        const es = position.exch || position.exchangeSegment || getExchangeSegment()
        const segmentMap = {
          'NSE': 'nse_cm',
          'BSE': 'bse_cm',
          'NFO': 'nse_fo',
          'BFO': 'bse_fo'
        }
        orderData = {
          "am": "NO",
          "dq": "0",
          "es": segmentMap[es] || es,
          "mp": "0",
          "pc": position.prd || position.pc || 'MIS',
          "pf": "N",
          "pr": "0",
          "pt": orderType,
          "qt": quantityToPlace.toString(),
          "rt": "DAY",
          "tk": (position.token || position.tk || position.instrumentToken || "").toString(),
          "tp": overrideTriggerPrice ? overrideTriggerPrice.toString() : "0",
          "ts": position.tsym || position.tradingSymbol,
          "tt": transactionType, // already 'B' or 'S' from closeAllPositions
          "tag": "Steadfast"
        }
      }

      let response

      // Check if paper trading mode is enabled
      if (paperTradingMode.value) {
        // Simulate paper trading order for position
        response = await simulatePaperTradeOrder(
          orderData,
          transactionType,
          optionType,
          { tradingSymbol: position.tsym },
          quantityToPlace / instrument.lotSize, // Convert quantity to lots
          quantityToPlace
        );

        // Add a visual indicator that this is a paper trade
        toastMessage.value = `[PAPER TRADE] Order placed for ${getSymbol(position)}`;
      } else {
        // Real trading - proceed with actual API calls
        if (selectedBroker.value?.brokerName === 'Flattrade') {
          const FLATTRADE_API_TOKEN = localStorage.getItem('FLATTRADE_API_TOKEN')
          const payload = qs.stringify(orderData)
          response = await axios.post(`${BASE_URL}/flattrade/placeOrder`, payload, {
            headers: {
              Authorization: `Bearer ${FLATTRADE_API_TOKEN}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          })
        } else if (selectedBroker.value?.brokerName === 'Shoonya') {
          const SHOONYA_API_TOKEN = localStorage.getItem('SHOONYA_API_TOKEN')
          const payload = qs.stringify(orderData)
          response = await axios.post(`${BASE_URL}/shoonya/placeOrder`, payload, {
            headers: {
              Authorization: `Bearer ${SHOONYA_API_TOKEN}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          })
        } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
          const accessToken = localStorage.getItem('KOTAKNEO_API_TOKEN')
          const sid = localStorage.getItem('KOTAKNEO_SID')
          const baseUrl = localStorage.getItem('KOTAKNEO_BASE_URL')
          response = await axios.post(`${BASE_URL}/kotakneo/placeOrder`, orderData, {
            headers: {
              Authorization: accessToken,
              sid: sid,
              baseurl: baseUrl,
              consumerkey: localStorage.getItem('KOTAKNEO_CONSUMER_KEY'),
              userid: selectedBroker.value.clientId,
              'Content-Type': 'application/json'
            }
          })
        }
      }

      console.log(`Placed order for ${quantityToPlace} quantity`)

      remainingQuantity -= quantityToPlace
      placedQuantity += quantityToPlace
    }

    console.log(`All orders placed successfully. Total: ${placedQuantity} quantity`)

    if (!paperTradingMode.value) {
      toastMessage.value = `Order(s) placed successfully for ${getSymbol(position)}`
    }
    showToast.value = true

    // Add a delay before fetching updated data
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Update both orders and positions
    await updateOrdersAndPositions()

    // Update fund limits
    await updateFundLimits()
  } catch (error) {
    console.error('Failed to place order for position:', error)
    toastMessage.value = 'Failed to place order for SL/Target'
    showToast.value = true
  }
}
export const closeAllPositions = async () => {
  try {
    // First cancel all pending orders to prevent margin blocks or unexpected fills
    await cancelPendingOrders()

    let positionsClosed = false

    const getSortedPositions = (positions) => {
      const getQty = (p) => Number(p?.netqty ?? p?.netQty ?? 0);
      if (sellerMode.value) {
        // Seller Mode: Close Short positions (netqty < 0) first
        return [...positions].sort((a, b) => getQty(a) - getQty(b));
      } else {
        // Default: Close Long positions (netqty > 0) first
        return [...positions].sort((a, b) => getQty(b) - getQty(a));
      }
    };

    if (selectedBroker.value?.brokerName === 'Flattrade') {
      const sortedPositions = getSortedPositions(flatTradePositionBook.value);
      for (const position of sortedPositions) {
        const netqty = Number(position.netqty)
        if (netqty !== 0) {
          const transactionType = netqty > 0 ? 'S' : 'B'
          const optionType = position.tsym.includes('C') ? 'CALL' : 'PUT'
          await placeOrderForPosition(transactionType, optionType, position)
          positionsClosed = true
        }
      }
    } else if (selectedBroker.value?.brokerName === 'Shoonya') {
      const sortedPositions = getSortedPositions(shoonyaPositionBook.value);
      for (const position of sortedPositions) {
        const netqty = Number(position.netqty)
        if (netqty !== 0) {
          const transactionType = netqty > 0 ? 'S' : 'B'
          const optionType = position.tsym.includes('C') ? 'CALL' : 'PUT'
          await placeOrderForPosition(transactionType, optionType, position)
          positionsClosed = true
        }
      }
    } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
      const sortedPositions = getSortedPositions(kotakNeoPositionBook.value);
      for (const position of sortedPositions) {
        const netqty = Number(position.netqty)
        if (netqty !== 0) {
          const transactionType = netqty > 0 ? 'S' : 'B'
          const optionType = position.tsym.includes('C') ? 'CALL' : 'PUT'
          await placeOrderForPosition(transactionType, optionType, position)
          positionsClosed = true
        }
      }
    }

    // Add a delay before fetching updated data
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Update both orders and positions
    await updateOrdersAndPositions()

    // Update fund limits
    await updateFundLimits()

    if (positionsClosed) {
      if (paperTradingMode.value) {
        toastMessage.value = `[PAPER TRADE] All ${selectedBroker.value?.brokerName} positions closed`
      } else {
        toastMessage.value = `All ${selectedBroker.value?.brokerName} positions closed successfully`
      }
    } else {
      toastMessage.value = `No positions to close for ${selectedBroker.value?.brokerName}`
    }
    showToast.value = true
  } catch (error) {
    console.error('Error closing positions:', error)
    toastMessage.value = 'Failed to close all positions'
    showToast.value = true
  }
}
export const cancelOrder = async (order) => {
  const orderId = order.norenordno
  const orderStatus = order.status

  console.log(`Attempting to cancel order ${orderId} with status ${orderStatus}`)
  // console.log(`Broker: ${selectedBroker.value?.brokerName}`);

  const cancellableStatuses = ['OPEN', 'OPN', 'SLO', 'PENDING', 'TRIGGER PENDING', 'TRG_PND']
  const normalizedStatus = orderStatus ? orderStatus.toUpperCase() : ''

  if (!cancellableStatuses.includes(normalizedStatus)) {
    console.log(`Order ${orderId} is not in a cancellable state (status: ${orderStatus}) and cannot be canceled.`)
    return
  }

  try {
    if (selectedBroker.value?.brokerName === 'Flattrade') {
      const jKey = localStorage.getItem('FLATTRADE_API_TOKEN') || token.value
      const clientId = selectedBroker.value.clientId
      console.log(`Sending request to cancel Flattrade order ${orderId}`)
      await axios.post(
        `${BASE_URL}/flattrade/cancelOrder`,
        {
          norenordno: orderId,
          uid: clientId
        },
        {
          params: {
            FLATTRADE_API_TOKEN: jKey
          }
        }
      )
    } else if (selectedBroker.value?.brokerName === 'Shoonya') {
      const jKey = localStorage.getItem('SHOONYA_API_TOKEN') || token.value
      const clientId = selectedBroker.value.clientId
      console.log(`Sending request to cancel Shoonya order ${orderId}`)
      await axios.post(
        `${BASE_URL}/shoonya/cancelOrder`,
        {
          norenordno: orderId,
          uid: clientId
        },
        {
          params: {
            SHOONYA_API_TOKEN: jKey
          }
        }
      )
    } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
      const accessToken = localStorage.getItem('KOTAKNEO_API_TOKEN')
      const sid = localStorage.getItem('KOTAKNEO_SID')
      const baseUrl = localStorage.getItem('KOTAKNEO_BASE_URL')
      console.log(`Sending request to cancel Kotak Neo order ${orderId}`)
      await axios.post(
        `${BASE_URL}/kotakneo/cancelOrder`,
        {
          orderId: orderId,
          tradingSymbol: order.trdSym || order.tsym || order.tradingSymbol
        },
        {
          headers: {
            Authorization: accessToken, // Maps to Auth on backend
            sid: sid,
            baseurl: baseUrl,
            serverid: localStorage.getItem('KOTAKNEO_SERVER_ID'),
            consumerkey: localStorage.getItem('KOTAKNEO_CONSUMER_KEY'),
            userid: selectedBroker.value.clientId
          }
        }
      )
    }
    console.log(`Order ${orderId} canceled successfully.`)
    // Update fund limits
    await updateFundLimits()
  } catch (error) {
    console.error(`Failed to cancel order ${orderId}:`, error)
    toastMessage.value = 'Failed to cancel order'
    showToast.value = true
    throw error // Rethrow to handle in cancelPendingOrders
  }
}

export const modifyOrder = async (order, newPrc, newQty, newTrgPrc = null) => {
  const orderId = order.norenordno
  console.log(`Attempting to modify order ${orderId}`)

  try {
    let response
    if (selectedBroker.value?.brokerName === 'KotakNeo') {
      const accessToken = localStorage.getItem('KOTAKNEO_API_TOKEN')
      const sid = localStorage.getItem('KOTAKNEO_SID')
      const baseUrl = localStorage.getItem('KOTAKNEO_BASE_URL')

      // Robustly determine Order Type (pt)
      let rawType = (order.prctyp || order.priceType || order.type || '').toUpperCase();

      // If type is missing, infer from parameters
      if (!rawType) {
        // Check for existing trigger price in order object (handled as trgprc or trigPrice or tp)
        const existingTrgPrc = order.trgprc || order.trigPrice || order.tp;
        const hasTrgPrc = (newTrgPrc && parseFloat(newTrgPrc) > 0) || (existingTrgPrc && parseFloat(existingTrgPrc) > 0);

        if (hasTrgPrc) rawType = 'SL';
        else if (parseFloat(newPrc) > 0) rawType = 'LMT';
        else rawType = 'MKT';
      }

      const pt = (rawType === 'SL-LMT' || rawType === 'SL') ? 'SL' :
        (rawType === 'SL-MKT' || rawType === 'SL-M') ? 'SL-M' :
          (rawType === 'LMT' || rawType === 'L') ? 'L' :
            (rawType === 'MKT' || rawType === 'M') ? 'MKT' : 'L'; // Default to Limit 'L' if all else fails

      const tt = (order.trantype || order.tt || '').toUpperCase()
      const es = order.exch || order.exchangeSegment || order.es || order.exSeg
      const pc = order.prod || order.product || order.prd || order.pc || 'MIS'

      const segmentMap = {
        'NSE': 'nse_cm',
        'BSE': 'bse_cm',
        'NFO': 'nse_fo',
        'BFO': 'bse_fo'
      }

      const modifyData = {
        on: orderId,
        am: "NO", // After Market Order: NO
        qt: newQty.toString(),
        pr: newPrc.toString(),
        pt: pt,
        rt: "DAY",
        ts: order.trdSym || order.tsym || order.tradingSymbol,
        tt: tt === 'BUY' ? 'B' : (tt === 'SELL' ? 'S' : tt),
        es: segmentMap[es] || es,
        pc: pc,
        dq: "0",
        mp: "0",
        tok: order.tok || order.token // Add Instrument Token
      }

      if (pt === 'SL' || pt === 'SL-M') {
        // Use new trigger price if available, otherwise fallback to existing
        const finalTrgPrc = newTrgPrc !== null ? newTrgPrc : (order.trgprc || order.trigPrice || order.tp);
        if (finalTrgPrc) {
          modifyData.tp = finalTrgPrc.toString();
        }
      }

      response = await axios.post(`${BASE_URL}/kotakneo/modifyOrder`, modifyData, {
        headers: {
          Authorization: accessToken,
          sid: sid,
          baseurl: baseUrl,
          serverid: localStorage.getItem('KOTAKNEO_SERVER_ID'),
          consumerkey: localStorage.getItem('KOTAKNEO_CONSUMER_KEY'),
          userid: selectedBroker.value.clientId,
          'Content-Type': 'application/json'
        }
      })
    } else {
      // Placeholder for other brokers if needed
      toastMessage.value = 'Modify not implemented for this broker yet'
      showToast.value = true
      return
    }

    console.log('Order modified successfully:', response.data)
    toastMessage.value = 'Order modified successfully'
    showToast.value = true

    // Refresh orders
    await updateOrdersAndPositions()
  } catch (error) {
    console.error(`Failed to modify order ${orderId}:`, error)
    toastMessage.value = 'Failed to modify order'
    showToast.value = true
    throw error
  }
}

export const cancelPendingOrders = async () => {
  // Fetch orders based on the selected broker
  if (selectedBroker.value?.brokerName === 'Flattrade') {
    await fetchFlattradeOrdersTradesBook()
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    await fetchShoonyaOrdersTradesBook()
  } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
    await fetchKotakNeoOrdersTradesBook()
  }

  const cancellableStatuses = ['OPEN', 'OPN', 'SLO', 'PENDING', 'TRIGGER PENDING', 'TRG_PND']
  let pendingOrders = []

  if (selectedBroker.value?.brokerName === 'Flattrade') {
    pendingOrders = flatOrderBook.value.filter((order) => cancellableStatuses.includes(order.status))
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    pendingOrders = shoonyaOrderBook.value.filter((order) => cancellableStatuses.includes(order.status))
  } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
    // Check status case-insensitively
    pendingOrders = kotakNeoOrderBook.value.filter((order) => {
      const status = order.status ? order.status.toUpperCase() : '';
      return cancellableStatuses.includes(status);
    });
    console.log('[DEBUG] KotakNeo Pending Orders to Cancel:', pendingOrders)
  } else {
    console.error('Unknown broker')
    return
  }

  const cancelPromises = pendingOrders.map((order) => cancelOrder(order))
  console.log(`Canceling pending orders for broker: ${selectedBroker.value?.brokerName}`) // placed here to prevent delay and debugging if required
  console.log(`Pending orders:`, pendingOrders) // placed here to prevent delay and debugging if required

  try {
    await Promise.all(cancelPromises)
    toastMessage.value = 'Pending orders canceled successfully'
    showToast.value = true

    // Refresh the orders list based on the selected broker
    if (selectedBroker.value?.brokerName === 'Flattrade') {
      await fetchFlattradeOrdersTradesBook()
    } else if (selectedBroker.value?.brokerName === 'Shoonya') {
      await fetchShoonyaOrdersTradesBook()
    } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
      await fetchKotakNeoOrdersTradesBook()
    }
  } catch (error) {
    console.error('Failed to cancel orders:', error)
    toastMessage.value = 'Failed to cancel some orders'
    showToast.value = true
  }
}
export const closeSelectedPositions = async () => {
  try {
    let positionsClosed = false

    const getSortedPositions = (positions) => {
      const getQty = (p) => Number(p?.netqty ?? p?.netQty ?? 0);
      if (sellerMode.value) {
        // Seller Mode: Close Short positions (netqty < 0) first
        return [...positions].sort((a, b) => getQty(a) - getQty(b));
      } else {
        // Default: Close Long positions (netqty > 0) first
        return [...positions].sort((a, b) => getQty(b) - getQty(a));
      }
    };

    if (selectedBroker.value?.brokerName === 'Shoonya') {
      // Find and sort the selected positions
      const positionsToClose = getSortedPositions(
        shoonyaPositionBook.value.filter(p => selectedShoonyaPositionsSet.value.has(p.tsym))
      )

      for (const position of positionsToClose) {
        const netqty = Number(position.netqty)
        if (netqty !== 0) {
          const transactionType = netqty > 0 ? 'S' : 'B'
          const optionType = position.tsym.includes('C') ? 'CALL' : 'PUT'
          await placeOrderForPosition(transactionType, optionType, position)
          positionsClosed = true

          // Remove from selection
          selectedShoonyaPositionsSet.value.delete(position.tsym)
        }
      }
    } else if (selectedBroker.value?.brokerName === 'Flattrade') {
      const positionsToClose = getSortedPositions(
        flatTradePositionBook.value.filter(p => selectedFlattradePositionsSet.value.has(p.tsym))
      )

      for (const position of positionsToClose) {
        const netqty = Number(position.netqty)
        if (netqty !== 0) {
          const transactionType = netqty > 0 ? 'S' : 'B'
          const optionType = position.tsym.includes('C') ? 'CALL' : 'PUT'
          await placeOrderForPosition(transactionType, optionType, position)
          positionsClosed = true

          selectedFlattradePositionsSet.value.delete(position.tsym)
        }
      }
    } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
      const positionsToClose = getSortedPositions(
        kotakNeoPositionBook.value.filter(p => selectedKotakNeoPositionsSet.value.has(p.tsym))
      )

      for (const position of positionsToClose) {
        const netqty = Number(position.netqty)
        if (netqty !== 0) {
          const transactionType = netqty > 0 ? 'S' : 'B'
          const optionType = position.tsym.includes('C') ? 'CALL' : 'PUT'
          await placeOrderForPosition(transactionType, optionType, position)
          positionsClosed = true

          selectedKotakNeoPositionsSet.value.delete(position.tsym)
        }
      }
    }

    // Add a delay before fetching updated data
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Update both orders and positions
    await updateOrdersAndPositions()

    // Update fund limits
    await updateFundLimits()

    if (positionsClosed) {
      toastMessage.value = `Selected positions closed successfully`
    } else {
      toastMessage.value = `No positions to close`
    }
    showToast.value = true
  } catch (error) {
    console.error('Error closing selected positions:', error)
    toastMessage.value = 'Failed to close selected positions'
    showToast.value = true
  }
}
