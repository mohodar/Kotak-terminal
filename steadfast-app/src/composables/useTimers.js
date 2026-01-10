import { currentTime, timeOffset } from '@/stores/globalStore'

let timerInterval = null

// Function to sync with WorldTimeAPI
const syncWithExchangeTime = async () => {
  try {
    const response = await fetch('https://worldtimeapi.org/api/timezone/Asia/Kolkata')
    const data = await response.json()
    const serverTime = new Date(data.datetime).getTime()
    const localTime = Date.now()
    timeOffset.value = serverTime - localTime
    console.log(`[Time Sync] Synchronized with Exchange Time. Offset: ${timeOffset.value}ms`)
  } catch (error) {
    console.error('[Time Sync] Failed to sync with Exchange Time:', error)
  }
}

export const initTimers = () => {
  // Initial Sync
  syncWithExchangeTime()

  // Clear existing interval if any
  if (timerInterval) clearInterval(timerInterval)

  // Update current time every second using the offset
  timerInterval = setInterval(() => {
    currentTime.value = Date.now() + (timeOffset.value || 0)
  }, 1000)
}

// Export the interval creator function (keeping for backward compatibility if used)
export const clockAnimatorInterval = (callback, interval) => {
  return setInterval(callback, interval)
}
