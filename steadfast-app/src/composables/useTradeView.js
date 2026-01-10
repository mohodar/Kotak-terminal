import { ref, computed, watch } from 'vue'
// Risk Management Composables
import { removeStoploss } from '@/composables/useRiskManagement'
import { debounce } from 'lodash'
import { getBrokerStatus } from '@/composables/useBrokerTokenValidator'
import { formatTradingSymbol } from '@/composables/useFormatters'

// Global State
import {
  BASE_URL,
  killSwitchActive,
  selectedCallStrike,
  selectedPutStrike,
  quantities,
  selectedMasterSymbol,
  selectedOrderType,
  selectedBroker,
  toastMessage,
  showToast,
  flatTradePositionBook,
  shoonyaPositionBook,
  positionSecurityIds,
  socket,
  defaultCallSecurityId,
  defaultPutSecurityId,
  currentSubscriptions,
  fundLimits,
  selectedExchange,
  positionLTPs,
  selectedProductType,
  limitPrice,
  triggerPrice,
  selectedFlattradePositionsSet,
  selectedShoonyaPositionsSet,
  flatOrderBook,
  flatTradeBook,
  shoonyaOrderBook,
  shoonyaTradeBook,
  kotakNeoOrderBook,
  kotakNeoTradeBook,
  kotakNeoPositionBook,
  enableHotKeys,
  niftyPrice,
  bankNiftyPrice,
  finniftyPrice,
  midcpniftyPrice,
  sensexPrice,
  bankexPrice,
  selectedBrokerName,
  activeTab,
  selectedExpiry,
  callStrikeOffset,
  putStrikeOffset,
  expiryOffset,
  showOHLCValues,
  masterOpenPrice,
  masterHighPrice,
  masterLowPrice,
  masterClosePrice,
  showStrikeDetails,
  callOpenPrice,
  callHighPrice,
  callLowPrice,
  callClosePrice,
  putOpenPrice,
  putHighPrice,
  putLowPrice,
  putClosePrice,
  totalRiskTargetToggle,
  totalRiskTargetType,
  totalRiskAmount,
  totalRiskPercentage,
  totalTargetAmount,
  totalTargetPercentage,
  closePositionsRisk,
  closePositionsTarget,
  riskAction,
  targetAction,
  stickyMTM,
  overtradeProtection,
  exchangeSymbols,
  expiryDates,
  selectedStrike,
  modalTransactionType,
  modalOptionType,
  latestCallLTP,
  latestPutLTP,
  activeFetchFunction,
  symbolData,
  allSymbolsData,
  errorMessage,
  statusMessage,
  callStrikes,
  putStrikes,
  MAX_RECONNECT_ATTEMPTS,
  INITIAL_RECONNECT_DELAY,
  reconnectAttempts,
  reconnectTimeout,
  wsConnectionState,
  messageQueue,
  stoplossValue,
  targetValue,
  sellerMode,
  sellerModeOffset,
  sellerModeExtraLots,
  currentModifyingOrder,
  modifyingPrice,
  modifyingQty,
  modifyingTriggerPrice
} from '@/stores/globalStore'

// Kill Switch Composables
import { toggleKillSwitch } from '@/composables/useKillSwitch'

// Order Management Composables
import {
  prepareOrderPayload,
  placeOrder,
  placeOrderForPosition,
  closeAllPositions,
  cancelPendingOrders,
  modifyOrder,
  cancelOrder
} from '@/composables/useOrderManagement'

// Broker Selection Composables
import {
  brokerStatus,
  updateSelectedBroker,
  setFlattradeCredentials,
  setShoonyaCredentials
} from '@/composables/useBrokerFunctions'

// Trade Configuration Composables
import {
  selectedLots,
  getProductTypeValue,
  getTransactionType,
  productTypes,
  updateAvailableQuantities,
  orderTypes,
  updateSelectedQuantity,
  updateStrikesForExpiry,
  synchronizeCallStrikes,
  synchronizePutStrikes
} from '@/composables/useTradeConfiguration'

// Portfolio Management Composables
import {
  updateOrdersAndPositions,
  fetchFlattradeOrdersTradesBook,
  fetchShoonyaOrdersTradesBook,
  fetchKotakNeoOrdersTradesBook,
  fetchFlattradePositions,
  fetchShoonyaPositions,
  fetchKotakNeoPositions,
  updatePositionSecurityIds,
  updateFundLimits,
  fetchFundLimit
} from '@/composables/usePositionManagement'

// Risk Management Composables
import { checkStoplossesAndTargets } from '@/composables/useRiskManagement'

// Market Data Composables
import {
  fetchTradingData,
  getMasterSymbolPrice,
  updateSymbolData
} from '@/composables/useMarketData'

// WebSocket Composables
import {
  subscribeToMasterSymbol,
  subscribeToOptions,
  unsubscribeFromSymbols,
  subscribeToPositionLTPs
} from '@/composables/useWebSocket'

import { setDefaultExpiry } from '@/composables/useAppSettings'

// PnL Calculations Composables
import {
  netPnl,
  availableBalance,
  totalProfit,
  usedAmount,
  totalNetQty,
  totalBuyValue,
  totalSellValue,
  totalCapitalPercentage
} from '@/composables/usePnlCalculations'

export const isFormDisabled = computed(() => killSwitchActive.value)

export const exchangeOptions = computed(() => {
  return Object.keys(exchangeSymbols.value).filter((key) => key !== 'symbolData')
})
export const todayExpirySymbol = computed(() => {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0 is Sunday, 1 is Monday, ..., 6 is Saturday

  for (const [symbol, data] of Object.entries(symbolData)) {
    if (data.expiryDay === dayOfWeek) {
      return symbol
    }
  }

  return null // No expiry today
})

export const maxLots = computed(() => {
  const instrument = quantities.value[selectedMasterSymbol.value]
  return instrument ? instrument.maxLots : 280
})
export const combinedOrdersAndTrades = computed(() => {
  const combined = {}

  if (selectedBroker.value?.brokerName === 'Flattrade') {
    // Process Flattrade orders and trades
    if (Array.isArray(flatOrderBook.value)) {
      flatOrderBook.value.forEach((order) => {
        combined[order.norenordno] = { order, trade: null }
      })
    }

    if (Array.isArray(flatTradeBook.value)) {
      flatTradeBook.value.forEach((trade) => {
        if (combined[trade.norenordno]) {
          combined[trade.norenordno].trade = trade
        } else {
          combined[trade.norenordno] = { order: null, trade }
        }
      })
    }
  } else if (selectedBroker.value?.brokerName === 'Shoonya') {
    // Process Shoonya orders and trades
    if (Array.isArray(shoonyaOrderBook.value)) {
      shoonyaOrderBook.value.forEach((order) => {
        combined[order.norenordno] = { order, trade: null }
      })
    }

    if (Array.isArray(shoonyaTradeBook.value)) {
      shoonyaTradeBook.value.forEach((trade) => {
        if (combined[trade.norenordno]) {
          combined[trade.norenordno].trade = trade
        } else {
          combined[trade.norenordno] = { order: null, trade }
        }
      })
    }
  } else if (selectedBroker.value?.brokerName === 'KotakNeo') {
    // Process Kotak Neo orders and trades
    if (Array.isArray(kotakNeoOrderBook.value)) {
      kotakNeoOrderBook.value.forEach((order) => {
        combined[order.norenordno] = { order, trade: null }
      })
    }

    if (Array.isArray(kotakNeoTradeBook.value)) {
      kotakNeoTradeBook.value.forEach((trade) => {
        if (combined[trade.norenordno]) {
          combined[trade.norenordno].trade = trade
        } else {
          combined[trade.norenordno] = { order: null, trade }
        }
      })
    }
  }

  const parseTimeToSeconds = (timeStr) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length < 3) return 0;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parseInt(parts[2], 10);
    return hours * 3600 + minutes * 60 + seconds;
  };

  return Object.values(combined).sort((a, b) => {
    const aTimeStr = a.order?.norentm || a.trade?.norentm;
    const bTimeStr = b.order?.norentm || b.trade?.norentm;
    return parseTimeToSeconds(bTimeStr) - parseTimeToSeconds(aTimeStr);
  });
})

export const previousOrderType = ref(orderTypes.value[0])

export const ltpRangeWidth = computed(() => {
  const low = parseFloat(masterLowPrice.value)
  const high = parseFloat(masterHighPrice.value)
  const ltp = getMasterSymbolPrice() // New helper function

  if (isNaN(low) || isNaN(high) || isNaN(ltp) || high === low) {
    return 0
  }

  return ((ltp - low) / (high - low)) * 100
})
export const ltpMarkerPosition = computed(() => {
  const low = parseFloat(masterLowPrice.value)
  const high = parseFloat(masterHighPrice.value)
  const ltp = getMasterSymbolPrice() // New helper function

  if (isNaN(low) || isNaN(high) || isNaN(ltp) || high === low) {
    return 0
  }

  return ((ltp - low) / (high - low)) * 100
})
// Computed Properties for LTP Range Bar for Call Strike
export const callLtpRangeWidth = computed(() => {
  const low = parseFloat(callLowPrice.value)
  const high = parseFloat(callHighPrice.value)
  const ltp = parseFloat(latestCallLTP.value)

  if (isNaN(low) || isNaN(high) || isNaN(ltp) || high === low) {
    return 0
  }

  return ((ltp - low) / (high - low)) * 100
})
export const callLtpMarkerPosition = computed(() => {
  const low = parseFloat(callLowPrice.value)
  const high = parseFloat(callHighPrice.value)
  const ltp = parseFloat(latestCallLTP.value) // Use the appropriate LTP value

  if (isNaN(low) || isNaN(high) || isNaN(ltp) || high === low) {
    return 0
  }

  return ((ltp - low) / (high - low)) * 100
})
// Computed Properties for LTP Range Bar for Put Strike
export const putLtpRangeWidth = computed(() => {
  const low = parseFloat(putLowPrice.value)
  const high = parseFloat(putHighPrice.value)
  const ltp = parseFloat(latestPutLTP.value)

  if (isNaN(low) || isNaN(high) || isNaN(ltp) || high === low) {
    return 0
  }

  return ((ltp - low) / (high - low)) * 100
})
export const putLtpMarkerPosition = computed(() => {
  const low = parseFloat(putLowPrice.value)
  const high = parseFloat(putHighPrice.value)
  const ltp = parseFloat(latestPutLTP.value) // Use the appropriate LTP value

  if (isNaN(low) || isNaN(high) || isNaN(ltp) || high === low) {
    return 0
  }

  return ((ltp - low) / (high - low)) * 100
})
// Computed Properties for LTP Range Bar for Live Underlying Price
export const openMarkerPosition = computed(() => {
  const low = parseFloat(masterLowPrice.value)
  const high = parseFloat(masterHighPrice.value)
  const open = parseFloat(masterOpenPrice.value)

  if (isNaN(low) || isNaN(high) || isNaN(open) || high === low) {
    return 0
  }

  return ((open - low) / (high - low)) * 100
})
// Computed Properties for LTP Range Bar for Call Strike
export const callOpenMarkerPosition = computed(() => {
  const low = parseFloat(callLowPrice.value)
  const high = parseFloat(callHighPrice.value)
  const open = parseFloat(callOpenPrice.value)

  if (isNaN(low) || isNaN(high) || isNaN(open) || high === low) {
    return 0
  }

  return ((open - low) / (high - low)) * 100
})
// Computed Properties for LTP Range Bar for Put Strike
export const putOpenMarkerPosition = computed(() => {
  const low = parseFloat(putLowPrice.value)
  const high = parseFloat(putHighPrice.value)
  const open = parseFloat(putOpenPrice.value)

  if (isNaN(low) || isNaN(high) || isNaN(open) || high === low) {
    return 0
  }

  return ((open - low) / (high - low)) * 100
})

export const availableStrikes = computed(() => {
  const allStrikes = new Set([
    ...callStrikes.value.map((strike) => strike.strikePrice),
    ...putStrikes.value.map((strike) => strike.strikePrice)
  ])
  return Array.from(allStrikes).sort((a, b) => a - b)
})

export const isValidLimitPrice = computed(() => {
  if (selectedOrderType.value === 'SL_LMT') {
    return triggerPrice.value > 0 && triggerPrice.value !== ''
  }
  return limitPrice.value > 0 && limitPrice.value !== ''
})
export const limitPriceErrorMessage = computed(() => {
  if (limitPrice.value === '') {
    return 'Limit price is required.'
  } else if (limitPrice.value <= 0) {
    return 'Enter a limit price.'
  }
  return ''
})

// ... (add all other computed properties here)

// Methods
export const updateToastVisibility = (value) => {
  showToast.value = value
}
export const setActiveTab = async (tab) => {
  activeTab.value = tab
  await setActiveFetchFunctionAndFetch()
}

export const checkOvertradeProtection = () => {
  if (!overtradeProtection.value) return

  const totalValue = Math.max(totalBuyValue.value, totalSellValue.value)
  const totalAvailableBalance = availableBalance.value + usedAmount.value

  if (totalValue > totalAvailableBalance) {
    if (!killSwitchActive.value) {
      toastMessage.value = `Overtrade protection activated. Total value: ₹${totalValue.toFixed(2)} exceeds available balance: ₹${availableBalance.value.toFixed(2)}`
      showToast.value = true
      toggleKillSwitch()
    }
  }
}

export const updateExchangeSymbols = () => {
  if (
    selectedBroker.value?.brokerName === 'Flattrade' ||
    selectedBroker.value?.brokerName === 'Shoonya' ||
    selectedBroker.value?.brokerName === 'KotakNeo'
  ) {
    exchangeSymbols.value = {
      ALL: ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'],
      NFO: ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY'],
      BFO: ['SENSEX', 'BANKEX']
    }
  }

  // Store symbolData in exchangeSymbols
  exchangeSymbols.value.symbolData = symbolData
}
export const setDefaultExchangeAndMasterSymbol = () => {
  const cachedData = JSON.parse(localStorage.getItem('cachedTradingData')) || {}

  // Set the exchange
  const savedExchange = cachedData.selectedExchange || localStorage.getItem('selectedExchange')
  if (savedExchange && exchangeOptions.value.includes(savedExchange)) {
    selectedExchange.value = savedExchange
  } else if (exchangeOptions.value.length > 0) {
    selectedExchange.value = exchangeOptions.value[0]
  }

  // Set the master symbol
  const savedMasterSymbol =
    cachedData.selectedMasterSymbol || localStorage.getItem('selectedMasterSymbol')
  if (
    savedMasterSymbol &&
    exchangeSymbols.value[selectedExchange.value]?.includes(savedMasterSymbol)
  ) {
    selectedMasterSymbol.value = savedMasterSymbol
  } else if (exchangeSymbols.value[selectedExchange.value]?.length > 0) {
    selectedMasterSymbol.value = exchangeSymbols.value[selectedExchange.value][0]
  }

  // If we have cached data for the selected symbol, populate allSymbolsData
  if (cachedData[selectedMasterSymbol.value]) {
    allSymbolsData[selectedMasterSymbol.value] = cachedData[selectedMasterSymbol.value]
  }
}

export const saveUserChoice = () => {
  localStorage.setItem('selectedExchange', selectedExchange.value)
  localStorage.setItem('selectedMasterSymbol', selectedMasterSymbol.value)
}

export const setOrderDetails = (transactionType, optionType) => {
  modalTransactionType.value = getTransactionType(transactionType) // Use getTransactionType to set modalTransactionType
  modalOptionType.value = optionType
  selectedOrderType.value = orderTypes.value[1] // Set selectedOrderType to LIMIT or LMT based on broker
  selectedStrike.value = optionType === 'CALL' ? selectedCallStrike.value : selectedPutStrike.value
}
export const handleOrderClick = async (transactionType, optionType) => {
  modalTransactionType.value = transactionType
  modalOptionType.value = optionType

  // Set the correct strike based on the option type
  if (optionType === 'CALL') {
    selectedStrike.value = selectedCallStrike.value
  } else if (optionType === 'PUT') {
    selectedStrike.value = selectedPutStrike.value
  }

  // Seller Mode Logic
  if (sellerMode.value && transactionType === 'SELL') {
    const offset = parseInt(sellerModeOffset.value) || 1; // Default to 1 strike away if not set

    // Get the appropriate strikes list
    const strikes = optionType === 'CALL' ? callStrikes.value : putStrikes.value;

    // Find index of current selected strike
    const currentIndex = strikes.findIndex(s => s.strikePrice === selectedStrike.value.strikePrice);

    if (currentIndex !== -1) {
      let hedgeIndex;

      if (optionType === 'CALL') {
        // For Call, we want OTM which is higher strike, so add offset
        // Assuming strikes are sorted ascending
        hedgeIndex = currentIndex + offset;
      } else {
        // For Put, we want OTM which is lower strike, so subtract offset
        // Assuming strikes are sorted ascending
        hedgeIndex = currentIndex - offset;
      }
      // Check if hedge index is within bounds
      if (hedgeIndex >= 0 && hedgeIndex < strikes.length) {
        const hedgeStrike = strikes[hedgeIndex];

        // Calculate hedge lots: User selected lots + Extra lots
        const mainLots = parseInt(selectedLots.value) || 1;
        const extraLots = parseInt(sellerModeExtraLots.value) || 0;
        const totalHedgeLots = mainLots + extraLots;

        console.log(`[Seller Mode] Placing Hedge BUY Order for Strike: ${hedgeStrike.strikePrice} (Quantity: ${totalHedgeLots} lots, Always Market Order)`);
        // Place the hedge order (BUY) - Force 'MKT' order type
        // Skip updates to avoid delay before placing the main sell order
        await placeOrder('BUY', optionType, hedgeStrike, 'MKT', true, totalHedgeLots);

        // Add 1-second delay to ensure hedge executes first
        console.log('[Seller Mode] Waiting 1 second for hedge execution...');
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        console.warn(`[Seller Mode] Hedge strike at index ${hedgeIndex} not found or out of bounds. Skipping hedge order.`);
        showToastNotification(`Hedge strike out of bounds (Offset: ${offset}). Skipping hedge order.`);
      }
    } else {
      console.warn(`[Seller Mode] Current strike not found in strikes list. Skipping hedge order.`);
      showToastNotification(`Current strike not found in list. Skipping hedge order.`);
    }
  }

  // If it's a limit order type, the modal will be shown automatically due to data-bs-toggle and data-bs-target
  if (['LMT', 'SL_LMT'].includes(selectedOrderType.value)) {
    // Set initial limit price based on the order type
    handleOrderTypeChange()
  } else {
    // For market orders, place the order directly
    await placeOrder(transactionType, optionType)
  }
}
export const resetOrderTypeIfNeeded = () => {
  if (previousOrderType.value === orderTypes.value[0]) {
    // Check if previousOrderType is MARKET or MKT
    resetOrderType()
  }
}

export const resetOrderType = () => {
  selectedOrderType.value = orderTypes.value[0] // Set selectedOrderType to MARKET or MKT based on broker
}

export const updateTradingSymbol = (strike) => {
  if (strike.optionType === 'CALL') {
    selectedCallStrike.value = strike
    defaultCallSecurityId.value = strike.securityId || 'N/A'
  } else if (strike.optionType === 'PUT') {
    selectedPutStrike.value = strike
    defaultPutSecurityId.value = strike.securityId || 'N/A'
  }

  // Trigger a re-subscription to the new security
  subscribeToOptions()
}

// WebSocket
export const updateSubscriptions = () => {
  const symbolsToUnsubscribe = []

  // Check if master symbol has changed
  if (currentSubscriptions.value.masterSymbol !== selectedMasterSymbol.value) {
    if (currentSubscriptions.value.masterSymbol) {
      const oldSymbolInfo =
        exchangeSymbols.value.symbolData[currentSubscriptions.value.masterSymbol]
      if (oldSymbolInfo) {
        symbolsToUnsubscribe.push(
          `${oldSymbolInfo.exchangeCode}|${oldSymbolInfo.exchangeSecurityId}`
        )
      }
    }
  }

  // Check if options have changed
  if (
    currentSubscriptions.value.callOption &&
    currentSubscriptions.value.callOption !== defaultCallSecurityId.value
  ) {
    const segment = currentSubscriptions.value.callOptionExchangeCode || 'NFO'
    symbolsToUnsubscribe.push(`${segment}|${currentSubscriptions.value.callOption}`)
  }
  if (
    currentSubscriptions.value.putOption &&
    currentSubscriptions.value.putOption !== defaultPutSecurityId.value
  ) {
    const segment = currentSubscriptions.value.putOptionExchangeCode || 'NFO'
    symbolsToUnsubscribe.push(`${segment}|${currentSubscriptions.value.putOption}`)
  }

  // Unsubscribe from old symbols
  if (symbolsToUnsubscribe.length > 0) {
    unsubscribeFromSymbols(symbolsToUnsubscribe)
  }

  // Subscribe to new symbols
  subscribeToMasterSymbol()
  subscribeToOptions()
  subscribeToPositionLTPs()
}

export const debouncedUpdateSubscriptions = debounce(updateSubscriptions, 100)

export const showToastNotification = (message) => {
  toastMessage.value = message
  updateToastVisibility(true)
  setTimeout(() => {
    updateToastVisibility(false)
  }, 3000)
}
export const getSecurityIdForSymbol = (symbol) => {
  const strike = [...callStrikes.value, ...putStrikes.value].find((s) => s.tradingSymbol === symbol)
  return strike ? strike.securityId : null
}
export const validateAndPlaceOrder = async () => {
  if (isValidLimitPrice.value) {
    await placeOrder(modalTransactionType.value, modalOptionType.value)
  } else {
    console.error('Invalid limit price')
    toastMessage.value = 'Invalid limit price'
    showToast.value = true
  }
}

export const placeSLLimitFromPosition = async (position, slValue) => {
  if (!slValue || slValue <= 0) {
    toastMessage.value = 'Please enter a valid stoploss value in the SL box'
    showToast.value = true
    return
  }

  const netqty = Number(position.netqty || position.netQty)
  if (netqty === 0) return

  const transactionType = netqty > 0 ? 'S' : 'B'
  const optionType = formatTradingSymbol(position.tsym).includes('CE') ? 'CALL' : 'PUT'

  await placeOrderForPosition(transactionType, optionType, position, 'SL-LMT', slValue)

  // Remove predefined stoploss to prevent duplicate closure
  removeStoploss(position)
}

export const handleOrderTypeChange = () => {
  console.log('Order Type Changed:', selectedOrderType.value)

  switch (selectedOrderType.value) {
    case 'MKT':
      limitPrice.value = null
      break
    case 'LMT':
      limitPrice.value = getCurrentLTP()
      triggerPrice.value = null
      break
    case 'SL_LMT':
      limitPrice.value = getCurrentLTP()
      triggerPrice.value = getCurrentLTP()
      break
    default:
      limitPrice.value = null
      triggerPrice.value = null
      break
  }
}

export const openModifyOrderModal = (order) => {
  currentModifyingOrder.value = order
  modifyingPrice.value = order.prc || order.price || 0
  modifyingQty.value = order.qty || 0
  modifyingTriggerPrice.value = order.trgprc || order.triggerPrice || null

  // Logic to show the modal (it will be shown by data-bs-toggle in component)
}

// Auto-calculate limit price when trigger price changes (for SL orders)
watch(modifyingTriggerPrice, (newTriggerPrice) => {
  if (newTriggerPrice && currentModifyingOrder.value) {
    const orderType = currentModifyingOrder.value.prctyp || currentModifyingOrder.value.priceType
    const transactionType = currentModifyingOrder.value.trantype || currentModifyingOrder.value.tt

    // Only auto-calculate for SL orders
    if (orderType === 'SL' || orderType === 'SL-LMT') {
      const triggerPrice = parseFloat(newTriggerPrice)

      // For SELL orders: Limit Price = Trigger Price - 2
      // For BUY orders: Limit Price = Trigger Price + 2
      if (transactionType === 'S' || transactionType === 'SELL') {
        modifyingPrice.value = (triggerPrice - 2).toFixed(2)
      } else if (transactionType === 'B' || transactionType === 'BUY') {
        modifyingPrice.value = (triggerPrice + 2).toFixed(2)
      }
    }
  }
})

export const updateOrder = async () => {
  if (!currentModifyingOrder.value) return

  try {
    await modifyOrder(
      currentModifyingOrder.value,
      modifyingPrice.value,
      modifyingQty.value,
      modifyingTriggerPrice.value
    )
    currentModifyingOrder.value = null
  } catch (error) {
    console.error('Error in updateOrder:', error)
  }
}

export const getCurrentLTP = () => {
  return modalOptionType.value === 'CALL'
    ? parseFloat(latestCallLTP.value)
    : parseFloat(latestPutLTP.value)
}

export const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text).then(
    () => {
      statusMessage.value = 'Token copied to clipboard'
      setTimeout(() => {
        statusMessage.value = ''
      }, 3000)
    },
    (err) => {
      console.error('Could not copy text: ', err)
      errorMessage.value = 'Failed to copy token'
      clearErrorMessage()
    }
  )
}

export const clearErrorMessage = () => {
  setTimeout(() => {
    errorMessage.value = ''
  }, 5000) // Clear error message after 5 seconds
}

export const getStatus = (broker) => {
  if (!broker || !broker.brokerName) {
    return { status: 'Unknown', statusClass: 'bg-secondary' }
  }

  const status = getBrokerStatus(broker.brokerName)
  let statusText = 'Activated'
  let statusClass = 'bg-success'

  if (status === 'Token missing') {
    statusText = `Token missing, Click Login/Generate`
    statusClass = 'bg-warning text-dark'
  } else if (status === 'expired') {
    statusText = `Token Expired, Click Login/Generate`
    statusClass = 'bg-warning text-dark'
  } else if (status === 'invalid') {
    statusText = 'Token Invalid'
    statusClass = 'bg-danger'
  } else if (status === 'unknown') {
    statusText = 'Checking...'
    statusClass = 'bg-info text-dark'
  }

  return { status: statusText, statusClass }
}

// Active Tab Functions
export const activeTabFunction = {
  Flattrade: {
    positions: 'fetchFlattradePositions',
    trades: 'fetchFlattradeOrdersTradesBook'
  },
  Shoonya: {
    positions: 'fetchShoonyaPositions',
    trades: 'fetchShoonyaOrdersTradesBook'
  },
  KotakNeo: {
    positions: 'fetchKotakNeoPositions',
    trades: 'fetchKotakNeoOrdersTradesBook'
  }
}

// SetActive Tab Function
export const setActiveFetchFunctionAndFetch = async () => {
  const brokerName = selectedBroker.value?.brokerName
  const tabType = activeTab.value === 'positions' ? 'positions' : 'trades'

  if (brokerName && activeTabFunction[brokerName]) {
    const functionName = activeTabFunction[brokerName][tabType]
    activeFetchFunction.value = functionName

    try {
      await eval(functionName)()
    } catch (error) {
      console.error(`Error fetching data for ${brokerName} ${tabType}:`, error)
      // Handle the error appropriately (e.g., show an error message to the user)
    }
  } else {
    console.error('Invalid broker or tab type')
  }
}

// Update your debouncedFetchData function
export const debouncedFetchData = debounce(async () => {
  await setActiveFetchFunctionAndFetch()
})

// ... (add all other methods here)

// Watchers
// Watch for the price values
watch(
  [niftyPrice, bankNiftyPrice, finniftyPrice, midcpniftyPrice, sensexPrice, bankexPrice],
  () => {
    if (selectedExpiry.value) {
      updateStrikesForExpiry(selectedExpiry.value)
    }
  }
)
watch(selectedLots, () => {
  updateSelectedQuantity()
})
watch(
  flatTradePositionBook,
  () => {
    updatePositionSecurityIds()
    subscribeToOptions()
  },
  { deep: true }
)
watch(
  shoonyaPositionBook,
  () => {
    updatePositionSecurityIds()
    subscribeToOptions()
  },
  { deep: true }
)
watch(
  kotakNeoPositionBook,
  () => {
    updatePositionSecurityIds()
    subscribeToOptions()
  },
  { deep: true }
)
// Watch for changes in selectedBrokerName
watch(selectedBrokerName, () => {
  updateSelectedBroker()
})
watch(selectedBroker, async (newBroker) => {
  if (newBroker) {
    try {
      selectedOrderType.value = orderTypes.value[0]
      previousOrderType.value = orderTypes.value[0]

      // Only set product type if it's not already set
      if (!selectedProductType.value) {
        const savedProductType = getInitialProductType()
        if (savedProductType) {
          selectedProductType.value = savedProductType
        } else {
          selectedProductType.value = getProductTypeValue(productTypes.value[1])
        }
      }

      await fetchFundLimit()
      updateExchangeSymbols()
      setDefaultExchangeAndMasterSymbol()
      await fetchTradingData()
      setDefaultExpiry()

      debouncedFetchData()
    } catch (error) {
      console.error('Error updating broker data:', error)
    }
  }
})
watch(activeTab, () => {
  debouncedFetchData()
})
// Watcher for selectedExpiry to repopulate strike prices
watch(selectedExpiry, async (newExpiry) => {
  // await fetchTradingData();
  updateStrikesForExpiry(newExpiry)
})
watch(selectedCallStrike, (newStrike, oldStrike) => {
  // console.log('Selected Call Strike changed:', newStrike);
  if (newStrike !== oldStrike) {
    defaultCallSecurityId.value = newStrike.securityId || 'N/A'
  }
})
watch(selectedPutStrike, (newStrike, oldStrike) => {
  // console.log('Selected Put Strike changed:', newStrike);
  if (newStrike !== oldStrike) {
    defaultPutSecurityId.value = newStrike.securityId || 'N/A'
  }
})
// Watchers for defaultCallSecurityId and defaultPutSecurityId
// This watcher handles unsubscribing and subscribing to new security IDs,
// setting Flattrade credentials, and sending WebSocket data when either ID changes.
// Modify the watcher for defaultCallSecurityId and defaultPutSecurityId
watch(
  [() => defaultCallSecurityId.value, () => defaultPutSecurityId.value],
  ([newCallId, newPutId], [oldCallId, oldPutId]) => {
    if (newCallId !== oldCallId || newPutId !== oldPutId) {
      debouncedUpdateSubscriptions()

      // Reset LTP values when subscribing to new symbols
      if (newCallId !== oldCallId) {
        latestCallLTP.value = 'N/A'
      }
      if (newPutId !== oldPutId) {
        latestPutLTP.value = 'N/A'
      }

      if (selectedBroker.value?.brokerName === 'Flattrade') {
        setFlattradeCredentials()
      }
      if (selectedBroker.value?.brokerName === 'Shoonya') {
        setShoonyaCredentials()
      }
    }
  },
  { deep: true }
)
// Modify the watcher for selectedMasterSymbol
watch(selectedMasterSymbol, (newValue, oldValue) => {
  saveUserChoice()
  updateAvailableQuantities()
  updateSelectedQuantity()

  updateSymbolData(newValue)

  setDefaultExpiry()

  // Force re-synchronization of strikes
  synchronizeCallStrikes()
  synchronizePutStrikes()

  // Update subscriptions
  debouncedUpdateSubscriptions()
})

// Watch productTypes to set the default selectedProductType
watch(
  productTypes,
  (newProductTypes) => {
    if (newProductTypes.length > 0) {
      // Only set default if there's no existing value
      if (!selectedProductType.value) {
        const savedProductType = getInitialProductType()
        if (savedProductType) {
          selectedProductType.value = savedProductType
        } else {
          selectedProductType.value = getProductTypeValue(newProductTypes[1]) // Default to 'Margin' or 'M'
        }
      }
    }
  },
  { immediate: true }
)
export const getInitialProductType = () => {
  const savedProductType = localStorage.getItem('selectedProductType')
  if (savedProductType) {
    return savedProductType
  }
  // If no saved value, return null and let the watcher set the default
  return null
}
watch(selectedProductType, (newValue) => {
  localStorage.setItem('selectedProductType', newValue)
})
// Add a watcher for selectedExchange
watch(selectedExchange, (newValue) => {
  saveUserChoice() // Save the user's choice
  if (exchangeSymbols.value[newValue].length > 0) {
    const savedMasterSymbol = localStorage.getItem('selectedMasterSymbol')
    selectedMasterSymbol.value =
      savedMasterSymbol && exchangeSymbols.value[newValue].includes(savedMasterSymbol)
        ? savedMasterSymbol
        : exchangeSymbols.value[newValue][0]
  } else {
    selectedMasterSymbol.value = null
  }
  updateAvailableQuantities()
})
watch(selectedOrderType, (newValue, oldValue) => {
  previousOrderType.value = oldValue
})
// Watcher to update localStorage when enableHotKeys changes
watch(enableHotKeys, (newValue) => {
  localStorage.setItem('EnableHotKeys', newValue.toString())
})
// Modify the existing watcher for positionLTPs
watch(
  positionLTPs,
  (newLTPs, oldLTPs) => {
    Object.entries(newLTPs).forEach(([tsym, ltp]) => {
      if (ltp !== oldLTPs[tsym]) {
        // console.log(`LTP changed for ${tsym}: ${oldLTPs[tsym]} -> ${ltp}`);
        const position = [...flatTradePositionBook.value, ...shoonyaPositionBook.value].find(
          (p) => (p.tsym || p.tradingSymbol) === tsym
        )
        if (position) {
          // console.log(`Found position for ${tsym}:`, position);
          // Check stoplosses and targets immediately when LTP changes
          checkStoplossesAndTargets()
        }
      }
    })
  },
  { deep: true }
)
watch(selectedExpiry, (newExpiry) => {
  updateStrikesForExpiry(newExpiry, true)
})
// Watch for changes to showOHLCValues and save to localStorage
watch(showOHLCValues, (newValue) => {
  localStorage.setItem('showOHLCValues', JSON.stringify(newValue))
})
watch(showStrikeDetails, (newValue) => {
  localStorage.setItem('showStrikeDetails', JSON.stringify(newValue))
})
// Watch for changes and update localStorage
watch(
  [masterOpenPrice, masterHighPrice, masterLowPrice, masterClosePrice],
  ([open, high, low, close]) => {
    localStorage.setItem('masterOpenPrice', open)
    localStorage.setItem('masterHighPrice', high)
    localStorage.setItem('masterLowPrice', low)
    localStorage.setItem('masterClosePrice', close)
  }
)

watch([callOpenPrice, callHighPrice, callLowPrice, callClosePrice], ([open, high, low, close]) => {
  localStorage.setItem('callOpenPrice', open)
  localStorage.setItem('callHighPrice', high)
  localStorage.setItem('callLowPrice', low)
  localStorage.setItem('callClosePrice', close)
})

watch([putOpenPrice, putHighPrice, putLowPrice, putClosePrice], ([open, high, low, close]) => {
  localStorage.setItem('putOpenPrice', open)
  localStorage.setItem('putHighPrice', high)
  localStorage.setItem('putLowPrice', low)
  localStorage.setItem('putClosePrice', close)
})
// Add this in your component's setup or mounted hook
watch(
  [
    selectedMasterSymbol,
    masterLowPrice,
    masterHighPrice,
    niftyPrice,
    bankNiftyPrice,
    finniftyPrice,
    midcpniftyPrice,
    sensexPrice,
    bankexPrice
  ],
  () => {
    // console.log('Master Symbol:', selectedMasterSymbol.value);
    // console.log('Low:', masterLowPrice.value);
    // console.log('High:', masterHighPrice.value);
    // console.log('LTP:', getMasterSymbolPrice());
    // console.log('Range Width:', ltpRangeWidth.value);
    // console.log('Marker Position:', ltpMarkerPosition.value);
  }
)
watch(totalRiskTargetToggle, (newValue) => {
  localStorage.setItem('totalRiskTargetToggle', JSON.stringify(newValue))
})

watch(totalRiskTargetType, (newValue) => {
  localStorage.setItem('totalRiskTargetType', newValue)
})

watch(totalRiskAmount, (newValue) => {
  localStorage.setItem('totalRiskAmount', newValue.toString())
})

watch(totalRiskPercentage, (newValue) => {
  localStorage.setItem('totalRiskPercentage', newValue.toString())
})

watch(totalTargetAmount, (newValue) => {
  localStorage.setItem('totalTargetAmount', newValue.toString())
})

watch(totalTargetPercentage, (newValue) => {
  localStorage.setItem('totalTargetPercentage', newValue.toString())
})

watch(closePositionsRisk, (newValue) => {
  localStorage.setItem('closePositionsRisk', JSON.stringify(newValue))
})

watch(closePositionsTarget, (newValue) => {
  localStorage.setItem('closePositionsTarget', JSON.stringify(newValue))
})

watch(riskAction, (newValue) => {
  localStorage.setItem('riskAction', newValue)
})

watch(targetAction, (newValue) => {
  localStorage.setItem('targetAction', newValue)
})
watch([totalBuyValue, totalSellValue, availableBalance], async () => {
  await fetchFundLimit()
  checkOvertradeProtection()
})

watch(stickyMTM, (newValue) => {
  localStorage.setItem('stickyMTM', JSON.stringify(newValue))
})
// ... (add all other watchers here)
export const updateTargetValue = () => {
  // Ensure target value is a positive number
  if (targetValue.value < 0) {
    targetValue.value = 0
  }

  // Save to localStorage
  localStorage.setItem('targetValue', targetValue.value.toString())
}

export const updateStoplossValue = () => {
  // Ensure stoploss value is a positive number
  if (stoplossValue.value < 0) {
    stoplossValue.value = 0
  }

  // Save to localStorage
  localStorage.setItem('stoplossValue', stoplossValue.value.toString())
}

export const updateHedgeExtraLots = () => {
  if (sellerModeExtraLots.value < 0) {
    sellerModeExtraLots.value = 0
  }
}

export const updateHedgeOffset = () => {
  if (sellerModeOffset.value < 0) {
    sellerModeOffset.value = 0
  }
}

export const handleFormInputMouseScroll = (event, options) => {
  if (isFormDisabled.value) return

  event.preventDefault()
  const direction = event.deltaY < 0 ? 1 : -1

  switch (options.type) {
    case 'quantity':
      const newValue = selectedLots.value + direction
      if (newValue >= 1 && newValue <= maxLots.value) {
        selectedLots.value = newValue
        updateSelectedQuantity()
      }
      break

    case 'strike':
      const strikes = options.strikeType === 'CALL' ? callStrikes.value : putStrikes.value
      const selectedStrike =
        options.strikeType === 'CALL' ? selectedCallStrike.value : selectedPutStrike.value

      const currentIndex = strikes.findIndex(
        (strike) => strike.securityId === selectedStrike.securityId
      )
      const newIndex = currentIndex - direction

      if (newIndex >= 0 && newIndex < strikes.length) {
        if (options.strikeType === 'CALL') {
          selectedCallStrike.value = strikes[newIndex]
        } else {
          selectedPutStrike.value = strikes[newIndex]
        }
        updateTradingSymbol(
          options.strikeType === 'CALL' ? selectedCallStrike.value : selectedPutStrike.value
        )
      }
      break

    case 'stoploss':
      // Use the useLocalStorage ref directly
      const newStoploss = Number(stoplossValue.value) + direction
      if (newStoploss >= 0) {
        stoplossValue.value = newStoploss // This will automatically update localStorage
        updateStoplossValue()
      }
      break

    case 'target':
      // Use the useLocalStorage ref directly
      const newTarget = Number(targetValue.value) + direction
      if (newTarget >= 0) {
        targetValue.value = newTarget // This will automatically update localStorage
        updateTargetValue()
      }
      break

    case 'hedge_extra':
      const newHedgeExtra = Number(sellerModeExtraLots.value) + direction
      if (newHedgeExtra >= 0) {
        sellerModeExtraLots.value = newHedgeExtra
        updateHedgeExtraLots()
      }
      break

    case 'hedge_offset':
      const newHedgeOffset = Number(sellerModeOffset.value) + direction
      if (newHedgeOffset >= 0) {
        sellerModeOffset.value = newHedgeOffset
        updateHedgeOffset()
      }
      break
  }
}
