import { createRouter, createWebHashHistory } from 'vue-router'
import HomePage from '../views/HomePage.vue'
import DetailPage from '../views/DetailPage.vue'
import OptionPage from '../views/OptionPage.vue'

const routes = [
  { path: '/', name: 'home', component: HomePage },
  { path: '/options', name: 'options', component: OptionPage },
  { path: '/detail/:symbol', name: 'detail', component: DetailPage }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
