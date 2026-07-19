export const partnerAiMockData = {
  ceoSummary: {
    yesterdayRevenueDirection: "decreased",
    demandSignal: "Friday early dinner is below forecast.",
    riskSignal: "Rain may reduce demand around 6 PM.",
    recommendedAction: "Launch a 15% early dinner campaign.",
    expectedGainToday: 386,
    confidence: 89,
    revenueDeltaPercent: -7
  },
  restaurantAiScore: {
    total: 84,
    subscores: [
      { key: "revenue", label: "Revenue Score", score: 86 },
      { key: "marketing", label: "Marketing Score", score: 78 },
      { key: "operations", label: "Operations Score", score: 82 },
      { key: "guest_loyalty", label: "Guest Loyalty Score", score: 88 },
      { key: "review", label: "Review Score", score: 91 },
      { key: "availability", label: "Availability Score", score: 74 },
      { key: "competition", label: "Competition Score", score: 80 }
    ]
  },
  riskScores: [
    { key: "revenue", label: "Revenue risk", level: "Medium", explanation: "Early dinner demand is pacing below forecast.", action: "Launch a 15% early dinner campaign." },
    { key: "reputation", label: "Reputation risk", level: "Low", explanation: "Recent sentiment is positive and review velocity is stable.", action: "Keep requesting post-visit feedback." },
    { key: "staff_shortage", label: "Staff shortage risk", level: "Medium", explanation: "Prime dinner demand could outpace host coverage.", action: "Add one host during 6-8 PM." },
    { key: "availability_gap", label: "Availability gap risk", level: "Low", explanation: "Reservation windows are aligned with expected demand.", action: "Keep prime dinner availability protected." },
    { key: "weather", label: "Weather risk", level: "High", explanation: "Rain is expected near the early dinner window.", action: "Notify favorite guests before 4 PM." },
    { key: "competitor_campaign", label: "Competitor campaign risk", level: "Medium", explanation: "Nearby competitors average 17% discounts tonight.", action: "Keep SmartTable offer at 15-18%." }
  ],
  confidenceContributions: [
    { label: "Reservation data", percent: 26 },
    { label: "Guest behavior", percent: 18 },
    { label: "Weather signals", percent: 14 },
    { label: "Traffic signals", percent: 10 },
    { label: "Local events", percent: 12 },
    { label: "Competitor signals", percent: 11 },
    { label: "Review signals", percent: 9 }
  ],
  monthlyRoi: {
    revenueRecovered: 5812,
    subscriptionCost: 199,
    netGain: 5613,
    roiPercentage: 2820,
    aiActionsAccepted: 17,
    bookingsGeneratedByAi: 43
  },
  actionHistory: [
    { time: "Today 9:08 AM", title: "AI recommendation created", status: "complete", result: "15% early dinner campaign recommended" },
    { time: "Today 9:11 AM", title: "Restaurant accepted recommendation", status: "complete", result: "Campaign approved by manager" },
    { time: "Today 9:14 AM", title: "Offer/campaign activated", status: "active", result: "4 early dinner tables opened" },
    { time: "Today 10:02 AM", title: "Bookings generated", status: "active", result: "+3 bookings from favorite guests" },
    { time: "Today 10:45 AM", title: "Revenue recovered", status: "watch", result: "+$286 tracked so far" }
  ],
  weeklyReport: {
    recoveredRevenue: 2380,
    bestCampaign: "15% early dinner campaign",
    weakestWindow: "Sunday late dinner",
    topCustomerSegment: "Neighborhood regulars",
    biggestRisk: "Weather-sensitive early dinner demand",
    nextWeekAction: "Open controlled 15-18% offers before rain and event windows."
  },
  demandCalendar: [
    { day: "Monday", window: "Lunch", status: "Normal", occupancy: 58, bookings: 4, discount: "10%", revenueLift: 120 },
    { day: "Monday", window: "Early dinner", status: "Weak", occupancy: 42, bookings: 3, discount: "18%", revenueLift: 210 },
    { day: "Monday", window: "Prime dinner", status: "Strong", occupancy: 86, bookings: 9, discount: "0-10%", revenueLift: 80 },
    { day: "Monday", window: "Late dinner", status: "Weak", occupancy: 34, bookings: 2, discount: "25%", revenueLift: 190 },
    { day: "Tuesday", window: "Lunch", status: "Normal", occupancy: 61, bookings: 5, discount: "10%", revenueLift: 140 },
    { day: "Tuesday", window: "Early dinner", status: "Normal", occupancy: 66, bookings: 6, discount: "12%", revenueLift: 160 },
    { day: "Tuesday", window: "Prime dinner", status: "Strong", occupancy: 88, bookings: 10, discount: "0-10%", revenueLift: 90 },
    { day: "Tuesday", window: "Late dinner", status: "Weak", occupancy: 39, bookings: 3, discount: "22%", revenueLift: 170 },
    { day: "Wednesday", window: "Lunch", status: "Normal", occupancy: 63, bookings: 5, discount: "10%", revenueLift: 145 },
    { day: "Wednesday", window: "Early dinner", status: "Weak", occupancy: 48, bookings: 4, discount: "18%", revenueLift: 220 },
    { day: "Wednesday", window: "Prime dinner", status: "Strong", occupancy: 91, bookings: 11, discount: "0-10%", revenueLift: 110 },
    { day: "Wednesday", window: "Late dinner", status: "Normal", occupancy: 55, bookings: 4, discount: "15%", revenueLift: 130 },
    { day: "Thursday", window: "Lunch", status: "Normal", occupancy: 65, bookings: 5, discount: "10%", revenueLift: 150 },
    { day: "Thursday", window: "Early dinner", status: "Normal", occupancy: 68, bookings: 6, discount: "12%", revenueLift: 165 },
    { day: "Thursday", window: "Prime dinner", status: "Strong", occupancy: 93, bookings: 12, discount: "0-10%", revenueLift: 125 },
    { day: "Thursday", window: "Late dinner", status: "Normal", occupancy: 57, bookings: 5, discount: "15%", revenueLift: 140 },
    { day: "Friday", window: "Lunch", status: "Weak", occupancy: 46, bookings: 4, discount: "18%", revenueLift: 240 },
    { day: "Friday", window: "Early dinner", status: "Weak", occupancy: 44, bookings: 4, discount: "15%", revenueLift: 386 },
    { day: "Friday", window: "Prime dinner", status: "Strong", occupancy: 96, bookings: 14, discount: "0-10%", revenueLift: 150 },
    { day: "Friday", window: "Late dinner", status: "Normal", occupancy: 64, bookings: 7, discount: "18%", revenueLift: 210 },
    { day: "Saturday", window: "Lunch", status: "Strong", occupancy: 82, bookings: 9, discount: "0-10%", revenueLift: 130 },
    { day: "Saturday", window: "Early dinner", status: "Strong", occupancy: 89, bookings: 12, discount: "0-10%", revenueLift: 160 },
    { day: "Saturday", window: "Prime dinner", status: "Strong", occupancy: 98, bookings: 16, discount: "0%", revenueLift: 190 },
    { day: "Saturday", window: "Late dinner", status: "Normal", occupancy: 69, bookings: 8, discount: "12%", revenueLift: 180 },
    { day: "Sunday", window: "Lunch", status: "Normal", occupancy: 60, bookings: 5, discount: "12%", revenueLift: 150 },
    { day: "Sunday", window: "Early dinner", status: "Normal", occupancy: 62, bookings: 6, discount: "12%", revenueLift: 165 },
    { day: "Sunday", window: "Prime dinner", status: "Normal", occupancy: 71, bookings: 8, discount: "10%", revenueLift: 170 },
    { day: "Sunday", window: "Late dinner", status: "Weak", occupancy: 28, bookings: 2, discount: "25%", revenueLift: 230 }
  ],
  feedbackIntelligence: {
    mostPhotographedDishes: ["Handmade pasta", "Chocolate dessert", "Wine by the glass"],
    positiveWords: ["warm", "excellent", "smooth", "fresh"],
    negativeWords: ["wait", "noise"],
    wouldRecommendPercent: 94,
    wouldReturnPercent: 88,
    repeatIntentSignal: "Strong",
    satisfactionTrend: "Improving"
  },
  portfolioRestaurants: [
    { name: "Restaurant A", health: 95, status: "strong", trend: "Revenue up" },
    { name: "Restaurant B", health: 84, status: "strong", trend: "Stable" },
    { name: "Restaurant C", health: 62, status: "needs-action", trend: "Needs action" },
    { name: "Restaurant D", health: 90, status: "strong", trend: "Strong" }
  ],
  competitorTracker: {
    nearbyCompetitorsActive: 8,
    averageLocalDiscount: 17,
    yourSuggestedDiscount: 20,
    competitivePosition: "Strong",
    trend: [44, 48, 46, 52, 57, 61, 66]
  },
  menuEngineering: {
    bestMarginItem: "Pasta",
    bestConversionItem: "Burger",
    weakItem: "Seafood special",
    suggestedAction: "Promote high-margin items during weak demand windows.",
    marginMix: [
      { label: "Pasta", value: 88 },
      { label: "Burger", value: 74 },
      { label: "Seafood", value: 46 }
    ]
  },
  dynamicPricing: [
    { window: "Lunch", discount: "15%", strength: 58, status: "watch" },
    { window: "Early dinner", discount: "20%", strength: 42, status: "risk" },
    { window: "Prime dinner", discount: "0-10%", strength: 86, status: "good" },
    { window: "Late dinner", discount: "25%", strength: 31, status: "risk" }
  ],
  loyaltyEngine: {
    favoriteGuests: 287,
    guestsReadyToReturn: 42,
    recommendedCampaign: "Come back this week and enjoy 15% off.",
    returnReadiness: [30, 36, 41, 49, 56, 63, 72]
  },
  reviewAnalyzer: {
    foodRating: 4.6,
    serviceRating: 4.3,
    ambienceRating: 4.7,
    recentSentiment: "Positive",
    mainImprovementArea: "Speed of service",
    sentimentTrend: [62, 66, 68, 71, 70, 74, 78]
  },
  reputationMonitor: {
    overallRating: 4.5,
    ratingTrend: "Up",
    negativeReviewRisk: "Low",
    guestSatisfaction: "Strong",
    reputationScore: 90
  },
  marketMetrics: {
    revenueComparison: [
      { label: "Without AI", value: 2840 },
      { label: "With AI", value: 3360 }
    ],
    sparkline: [32, 38, 35, 44, 51, 49, 61, 68]
  }
};
