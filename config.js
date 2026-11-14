// ============================================================
//  ABM Payment Management — settings
//  Fill in the Firebase and EmailJS values (see README.md).
//  Until you do, the site runs in DEMO MODE: data is saved
//  only in this browser and the OTP is shown on screen.
// ============================================================
window.CONFIG = {
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID",
  },

  emailjs: {
    publicKey: "YOUR_PUBLIC_KEY",
    serviceId: "YOUR_SERVICE_ID",
    templateId: "YOUR_TEMPLATE_ID",
  },

  // ABM account login OTP is sent here
  OTP_EMAIL: "antonkuriakose@gmail.com",

  FEE_AMOUNT: 70000,     // fees every two months
  REMINDER_DAYS: 7,      // how long an ABM fee reminder stays up
  OTP_MINUTES: 5,        // OTP expiry
};
