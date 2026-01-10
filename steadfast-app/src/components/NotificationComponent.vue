<template>
    <div class="notification-container d-flex align-items-center">
        <div class="notification-icon me-2" :class="{ 'has-notification': showToast }">
            <font-awesome-icon icon="bell" />
        </div>
        <div class="notification-message" :class="{ 'show-message': showToast }">
            {{ message || 'No new notifications' }}
        </div>
    </div>
</template>

<style scoped>
.notification-container {
    position: relative;
    z-index: 1000;
}

.notification-icon {
    font-size: 1.2rem;
    color: #6c757d;
    transition: color 0.3s ease;
}

.notification-icon.has-notification {
    color: #ffc107;
    animation: pulse 1s infinite;
}

.notification-message {
    max-width: 0;
    overflow: hidden;
    white-space: nowrap;
    transition: max-width 0.5s ease, opacity 0.3s ease;
    opacity: 0;
    background-color: rgba(0, 0, 0, 0.7);
    color: white;
    border-radius: 4px;
    padding: 0;
}

.notification-message.show-message {
    max-width: 300px;
    opacity: 1;
    padding: 0.25rem 0.5rem;
}

@keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.2); }
    100% { transform: scale(1); }
}
</style>

<script setup>
import { ref, watch } from 'vue';
import { FontAwesomeIcon } from '@/font-awesome';

const props = defineProps({
    showToast: Boolean,
    message: String,
    notificationSound: Boolean,
});

const emit = defineEmits(['update:showToast', 'update:message']);

const audio = ref(new Audio('/long-pop.wav')); // Preload the audio
const notificationTimer = ref(null);

watch(() => props.showToast, (newShowToast, oldShowToast) => {
    if (newShowToast && newShowToast !== oldShowToast) {
        if (props.notificationSound) {
            playNotificationSound();
        }
        startNotificationTimer();
    }
});

const playNotificationSound = () => {
    try {
        if (audio.value) {
            audio.value.currentTime = 0; // Reset to start
            
            // Check if browser context allows audio playback
            const context = new (window.AudioContext || window.webkitAudioContext)();
            if (context.state === 'suspended') {
                // If audio context is suspended, we need user interaction
                document.addEventListener('click', function audioPlayHandler() {
                    const playPromise = audio.value.play();
                    
                    if (playPromise !== undefined) {
                        playPromise.catch(error => {
                            // Don't log the error to console to avoid cluttering
                            // console.log('Notification sound blocked:', error);
                        });
                    }
                    
                    // Remove the event listener after first click
                    document.removeEventListener('click', audioPlayHandler);
                }, { once: true });
            } else {
                // Try to play immediately (will work if user already interacted)
                const immediatePlayPromise = audio.value.play();
                if (immediatePlayPromise !== undefined) {
                    immediatePlayPromise.catch(() => {
                        // Silent catch - we'll try again on user interaction
                        // Add event listener for future interaction
                        document.addEventListener('click', function audioPlayHandler() {
                            audio.value.play().catch(() => {});
                            document.removeEventListener('click', audioPlayHandler);
                        }, { once: true });
                    });
                }
            }
        }
    } catch (error) {
        // Don't log the error to console to avoid cluttering
        // console.error('Error playing notification sound:', error);
    }
};

const startNotificationTimer = () => {
    if (notificationTimer.value) {
        clearTimeout(notificationTimer.value);
    }
    notificationTimer.value = setTimeout(() => {
        clearNotification();
    }, 3000); // Hide after 3 seconds
};

const clearNotification = () => {
    emit('update:showToast', false);
    emit('update:message', '');
    if (audio.value) {
        audio.value.pause();
        audio.value.currentTime = 0;
    }
    if (notificationTimer.value) {
        clearTimeout(notificationTimer.value);
    }
};
</script>
