// ============================================================
//  ABM Payment Management — settings
//  Fill in the Firebase and EmailJS values (see README.md).
//  Until you do, the site runs in DEMO MODE: data is saved
//  only in this browser and the OTP is shown on screen.
// ============================================================
window.CONFIG = {
  firebase: {
    apiKey: "AIzaSyCsHaYLzDWLA51bePDVh6-MiX3jZIV5FOg",
    authDomain: "abm-project-225a9.firebaseapp.com",
    projectId: "abm-project-225a9",
    storageBucket: "abm-project-225a9.firebasestorage.app",
    messagingSenderId: "28085950990",
    appId: "1:28085950990:web:40b11a481ed6e5d699ba5f",
  },

  emailjs: {
    publicKey: "LjhvzIj61Xk8HL7LP",
    serviceId: "service_h2dydqp",
    templateId: "template_oeak9un",
  },

  // ABM account login OTP is sent here
  OTP_EMAIL: "antonkuriakose@gmail.com",

  FEE_AMOUNT: 70000,     // fees every two months
  REMINDER_DAYS: 7,      // how long an ABM fee reminder stays up
  OTP_MINUTES: 5,        // OTP expiry
};
