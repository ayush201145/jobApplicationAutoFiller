# <img src="icons/icon48.png" align="center" width="32" height="32" /> AI Job Assistant

An intelligent Chrome extension that automates job applications, generates tailored cover letters, formulates diplomatic salary answers, and tracks your job applications—powered by **Google Gemini 1.5**.

---

## 🌟 Key Features

*   **⚡ AI Autofill & Review**: Automatically scans job application pages and fills form fields (text inputs, selects, textareas) based on your selected resume profile.
*   **📄 Tailored Cover Letter Generator**: Generates customized cover letters using your resume and the captured job description. Download as PDF (A4 formatting) or plain `.txt` file.
*   **💰 Smart Salary Expectation Answers**: Scans the page for salary, location, and role, then drafts a diplomatic, confident response for salary expectation questions.
*   **📊 Job Application Tracker**: Auto-saves your applications (Company, Job Title, URL, Date, and Status) and allows status tracking (Applied, Interview, Offer, Rejected). Export history as CSV anytime.
*   **👥 Multiple Resume Profiles**: Switch between different developer personas (e.g., Frontend, Full-Stack, Backend) with dedicated resume profiles.
*   **🔒 Local & Private**: Your Gemini API key and resumes are stored safely in browser local storage. Data is sent only to Google's official Gemini API.

---

## 🛠️ Supported Job Boards

The extension has built-in DOM parsers and optimized handlers for:
*   **LinkedIn**
*   **Greenhouse.io**
*   **Lever.co**
*   **Workable**
*   **MyWorkdayJobs**

---

## 🚀 Installation & Setup

### 1. Install the Extension in Chrome / Edge / Brave
1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/ayush201145/jobApplicationAutoFiller.git
   ```
2. Open your browser and navigate to the extensions management page:
   *   **Chrome**: Go to `chrome://extensions/`
   *   **Edge**: Go to `edge://extensions/`
   *   **Brave**: Go to `brave://extensions/`
3. Enable **Developer mode** using the toggle switch in the top-right corner.
4. Click on **Load unpacked** (top-left) and select the `jobFiller` folder that contains this codebase.

### 2. Configure Gemini API Key
1. Get a free Gemini API key from [Google AI Studio](https://aistudio.google.com/).
2. Click the **AI Job Assistant** icon in your browser toolbar to open the extension popup.
3. Switch to the **Settings** tab.
4. Paste your API key in the **Gemini API key** input field (it saves automatically).

### 3. Add a Resume Profile
1. In the **Settings** tab, click **+ Add** under the Profiles section.
2. Provide a profile name (e.g., *Frontend Developer*, *Data Scientist*).
3. Paste the plain text version of your resume in the **Résumé text** area.
4. Click **Save profile**.

---

## 📖 How to Use

### 1. Autofilling Job Applications
1. Navigate to a job application on a supported board (e.g., Greenhouse, LinkedIn).
2. Open the extension and go to the **Autofill** tab.
3. Choose the active profile/resume you want to use.
4. Click **Scan page** to detect the input fields on the application.
5. Click **Fill + review**. Gemini will process the fields and fill them directly into the browser page.

### 2. Generating a Cover Letter
1. Open the extension and go to the **Cover Letter** tab.
2. If **Auto-detect job description** was active, the JD might already be captured. If not, copy and paste the job posting details.
3. Select your desired output format:
   *   **Download PDF**: Generates a clean, professional A4 formatted PDF.
   *   **Download .txt**: Generates a standard text document.

### 3. Smart Salary Answer
1. In the **Salary** tab, click **Scan page + generate answer**.
2. Review the Gemini-generated diplomatic response.
3. Click **Copy to clipboard** and paste it into the application form's salary field.

### 4. Tracking Applications
1. As you submit applications, the extension logs them automatically.
2. In the **Tracker** tab, manage application statuses (Applied, Interview, Offer, Rejected).
3. Export all your data to Excel or Google Sheets by clicking **Export CSV**.

---

## ⚙️ Tech Stack & Dependencies

*   **Frontend**: HTML5, CSS3 (Modern HSL variables & Dark theme layout), Javascript (ES6)
*   **AI Engine**: Google Gemini API (using native fetch stream integration)
*   **PDF Generation**: [jsPDF](https://github.com/parallax/jsPDF) (Included local bundle `jspdf.umd.min.js`)
*   **Storage**: Chrome Extension Storage API (`chrome.storage.local`)
*   **Permissions**: `activeTab`, `storage`, `scripting`, `tabs`
