<template>
  <section class="Navigation AppNavigationComponent">
    <nav class="navbar navbar-expand-lg shadow-sm mt-0 mb-3">
      <div class="container-fluid pt-0">
        <RouterLink to="/" class="navbar-brand d-none">
          <img src="/steadfast_logo.png" class="Navigation__logo" alt="Steadfast" />
          <span class="ms-2 fw-bold text-color d-none d-md-inline">Steadfast</span>
        </RouterLink>
        <!-- Paper Trading Mode Indicator -->
        <div v-if="paperTradingMode" class="paper-trading-indicator me-2">
          <span class="badge bg-warning text-dark">
            <font-awesome-icon icon="file-alt" class="me-1" />
            PAPER TRADING
          </span>
        </div>        <!-- Current Time Display (Kolkata) -->
        <div class="current-time-display">
          <span class="badge bg-dark">
            <font-awesome-icon icon="clock" class="me-1" />
            {{ kolkataTime }}
          </span>
        </div>
        
        <button
          class="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarSupportedContent"
          aria-controls="navbarSupportedContent"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <font-awesome-icon icon="bars" class="text-color" />
        </button>
        <!-- Always-on Notification Area -->
        <div class="notification-area d-flex align-items-center ms-3 d-lg-none">
          <NotificationComponent
            v-model:showToast="showToast"
            v-model:message="toastMessage"
            :notificationSound="notificationSound"
          />
        </div>
        <div class="collapse navbar-collapse" id="navbarSupportedContent">
          <ul class="navbar-nav me-md-auto">
            <li class="nav-item" v-for="route in routes" :key="route.path">
              <RouterLink
                :to="route.path"
                class="nav-link"
                :class="{ 'active-route': $route.path === route.path }"
              >
                <font-awesome-icon :icon="route.icon" :class="['nav-icon', route.iconClass]" />
                <span class="nav-text">{{ route.name }}</span>
              </RouterLink>
            </li>
          </ul>
          <!-- Always-on Notification Area -->
          <div class="notification-area d-none d-lg-flex align-items-center ms-3">
            <NotificationComponent
              v-model:showToast="showToast"
              v-model:message="toastMessage"
              :notificationSound="notificationSound"
            />
          </div>
        </div>
      </div>
    </nav>
  </section>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue'
import { FontAwesomeIcon } from '@/font-awesome'
import { useRouter } from 'vue-router'
import NotificationComponent from './NotificationComponent.vue'

// Global State
import { notificationSound, toastMessage, showToast, paperTradingMode, currentTime } from '@/stores/globalStore'

// Kolkata time display
const kolkataTime = computed(() => {
  const now = new Date(currentTime.value)
  
  // Convert to Kolkata time (UTC+5:30)
  const options = {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }
  
  return now.toLocaleTimeString('en-US', options)
})

const routes = ref([
  { path: '/steadfast', name: 'Trade', icon: ['fas', 'bolt'], iconClass: 'text-danger' },
  { path: '/app-settings', name: 'Settings', icon: ['fas', 'cog'], iconClass: 'text-purple' },
  {
    path: '/manage-brokers',
    name: 'Brokers',
    icon: ['fas', 'dollar-sign'],
    iconClass: 'text-success'
  }
])

const router = useRouter()
</script>

<style scoped>
.current-time-display {
  display: flex;
  align-items: center;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
}

.current-time-display .badge {
  font-weight: bold;
  padding: 0.5rem 0.75rem;
  background-color: #343a40;
  color: #fff;
  border-radius: 4px;
  font-size: 1.2rem; /* Increased font size */
}

.paper-trading-indicator {
  display: flex;
  align-items: center;
}

.paper-trading-indicator .badge {
  font-weight: bold;
  padding: 0.5rem 0.75rem;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
  100% {
    opacity: 1;
  }
}


</style>
