from django.urls import path
from .views import (
    create_user,
    list_chefs,
    create_subscription,
    submit_feedback,
    create_chef,
    menu_preference,
    weekly_menu,
    ActiveSubscriptionView,
    health_check,
    generate_ai_weekly_menu,
    cuisine_search,
    today_meal_schedule,
    scheduling_capacity_check,
    payment_create_order,
    subscription_price_preview,
    payment_verify,
)

from .views import assign_chef

urlpatterns = [
    path('register/', create_user,name='register'),
    # path('chefs/', list_chefs),
    path('subscriptions/create/', create_subscription),
    path('feedback/', submit_feedback),
    path('assign-chef/', assign_chef),
    path('chefs/create/', create_chef),
    path('menu/weekly/', weekly_menu),
    path('menu/today/', today_meal_schedule),
    path('menu/generate/', generate_ai_weekly_menu),
    path('menu/preference/', menu_preference),
    path('cuisines/search/', cuisine_search),
    path('scheduling/capacity-check/', scheduling_capacity_check),
    path('subscriptions/price-preview/', subscription_price_preview),
    path('payments/create-order/', payment_create_order),
    path('payments/verify/', payment_verify),
    path("subscription/active/", ActiveSubscriptionView.as_view()),
    path("health/", health_check),

]
