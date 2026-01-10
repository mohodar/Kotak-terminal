<template>
  <AppNavigationComponent />
  <section class="row py-5">
    <div class="row">
      <div class="col-6">
        <h3>Steps to add your broker 💰</h3>

        <div class="card w-100 h-75 border">
          <div class="card-body">
            <p class="card-text">YouTube Video</p>
          </div>
        </div>
      </div>

      <div class="col-6">
        <h3>Add broker API Details 🔐</h3>
        <p>Please watch the YouTube video on how to obtain the following details.</p>
        <!-- Select Broker -->
        <form @submit.prevent="addBroker">
          <label for="SelectBroker" class="mt-3 form-label mb-0"><b>Select Broker</b></label>
          <select v-model="selectedBroker" class="form-select" aria-label="Select Broker">
            <option value="">Select a broker</option>
            <option v-for="supportedBroker in supportedBrokers" :key="supportedBroker" :value="supportedBroker">
              {{ supportedBroker }}
            </option>
          </select>

          <!-- Link to Open Selected Broker's API Dashboard -->
          <div class="text-center w-100" v-if="selectedBroker">
            <button class="btn btn-outline-primary my-3" @click="openBrokerDashboard" :disabled="!selectedBroker">
              Click here to access your {{ selectedBroker }} API Dashboard
            </button>
          </div>

          <label for="ClientID" class="form-label mb-0 mt-3"><b>UCC / Client ID</b></label>
          <input v-model="clientId" type="text" class="form-control" id="ClientID" placeholder="Enter UCC or Client ID" required>

          <!-- API Key / Access Token -->
          <label for="APIKey" class="form-label mb-0 mt-3"><b>{{ selectedBroker === 'KotakNeo' ? 'Access Token' : 'API Key' }}</b></label>
          <input v-model="apiKey" type="text" class="form-control" id="APIKey" :placeholder="selectedBroker === 'KotakNeo' ? 'Enter Access Token from Neo Dashboard' : 'Enter API Key'" required>

          <!-- API Secret Key (only for Flattrade) -->
          <input v-if="selectedBroker === 'Flattrade'" v-model="apiSecret" type="text" class="form-control"
            id="APISecretKey" required>

          <!-- Mobile Number (for Kotak Neo) -->
          <label v-if="selectedBroker === 'KotakNeo'" for="MobileNumber" class="form-label mb-0 mt-3"><b>Mobile Number</b></label>
          <input v-if="selectedBroker === 'KotakNeo'" v-model="mobileNumber" type="text" class="form-control" id="MobileNumber" placeholder="Enter Mobile Number with +91" required>


          <!-- MPIN (for Kotak Neo) -->
          <label v-if="selectedBroker === 'KotakNeo'" for="MPIN" class="form-label mb-0 mt-3"><b>MPIN</b></label>
          <input v-if="selectedBroker === 'KotakNeo'" v-model="mpin" type="password" class="form-control" id="MPIN" required>


          <!-- Redirect URL -->
          <label v-show="selectedBroker !== ''" for="RedirectURL" class="form-label mb-0 mt-3"><b>Redirect
              URL</b></label>
          <input v-show="selectedBroker !== ''" type="text" class="form-control" id="RedirectURL" :value="redirectURL"
            disabled required>
          <p v-show="selectedBroker !== ''" class="form-text text-info">If your broker requires a redirect URL, register
            this URL in your broker's
            portal to get API details.
          </p>

          <!-- Warning for Kotak Neo -->
          <div v-if="selectedBroker === 'KotakNeo' && apiKey === clientId && apiKey !== ''" class="alert alert-warning p-2 mt-2" style="font-size: 0.85rem;">
            ⚠️ <b>Note:</b> For Kotak Neo, the <b>API Key</b> should be a long string (Consumer Key), not your Client ID (UCC). 
          </div>

          <!-- Add Broker -->
          <div class="d-flex justify-content-between mt-5">
            <button class="btn btn-primary w-100">Add Broker</button>
            <RouterLink to="/manage-brokers" class=" ms-2 w-100">
              <button class="btn btn-secondary w-100">Cancel</button>
            </RouterLink>
          </div>
        </form>
      </div>
    </div>


  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import AppNavigationComponent from '@/components/AppNavigationComponent.vue';
import { supportedBrokers } from '@/stores/globalStore';
const router = useRouter();
const redirectURL = computed(() => {
  const baseUrl = import.meta.env.DEV ? 'http://localhost:5173' : import.meta.env.VITE_BASE_URL;
  return `${baseUrl}/${selectedBroker.value.toLowerCase()}/redirect?`;
});

const selectedBroker = ref('');
const apiKey = ref('');
const apiSecret = ref('');
const clientId = ref('');
const mobileNumber = ref('');
const mpin = ref('');
const password = ref('');

// Watch for changes in selectedBroker to prefill default values
watch(selectedBroker, (newBroker) => {
  apiKey.value = '';
  clientId.value = '';
  apiSecret.value = '';
  mobileNumber.value = '';
  mpin.value = '';
  password.value = '';
});

const getBrokerDashboardLink = computed(() => {
  switch (selectedBroker.value) {
    case 'Flattrade':
      return 'https://wall.flattrade.in/';
    case 'Shoonya':
      return 'https://prism.shoonya.com/';
    case 'KotakNeo':
      return 'https://neo.kotaksecurities.com/Login';
    default:
      return '#';
  }
});
const openBrokerDashboard = () => {
  if (selectedBroker.value) {
    window.open(getBrokerDashboardLink.value, '_blank');
  }
};

const addBroker = () => {
  const brokerDetails = {
    brokerName: selectedBroker.value,
    clientId: clientId.value,
    apiKey: apiKey.value,
  };

  if (selectedBroker.value === 'Flattrade') {
    brokerDetails.apiSecret = apiSecret.value;
  }
  if (selectedBroker.value === 'KotakNeo') {
    brokerDetails.mobileNumber = mobileNumber.value;
    brokerDetails.mpin = mpin.value;
  }

  // Generate a unique key for the broker
  const brokerKey = `broker_${selectedBroker.value}_${clientId.value}`;

  // Store in localStorage
  localStorage.setItem(brokerKey, JSON.stringify(brokerDetails));

  // Navigate to manage-brokers page
  router.push('/manage-brokers');
};
</script>
