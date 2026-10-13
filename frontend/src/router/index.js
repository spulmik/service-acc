import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      component: HomeView
    },
    {
      path: "/iframe",
      name: "iframe",
      component: HomeView
    },
    {
      path: "/:pathMatch(.*)*",
      redirect: "/"
    }
  ]
});

export default router;