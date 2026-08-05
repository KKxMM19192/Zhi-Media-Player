import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import './assets/css/base.css'

createApp(App).use(createPinia()).mount('#app')
