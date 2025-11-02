import React, { useState, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import mockData from "./mockdata.json";
import VitalsDashboard from "./components/VitalsDashboard";



// Mock data for the charts
// const heartRateData = [
//   { time: '6:00 AM', value: 72 },
//   { time: '8:00 AM', value: 75 },
//   { time: '10:00 AM', value: 78 },
//   { time: '12:00 PM', value: 82 },
//   { time: '2:00 PM', value: 80 },
//   { time: '4:00 PM', value: 76 },
//   { time: '6:00 PM', value: 74 },
//   { time: '8:00 PM', value: 70 },
// ];

// const oxygenData = [
//   { time: '6:00 AM', value: 98 },
//   { time: '8:00 AM', value: 97 },
//   { time: '10:00 AM', value: 99 },
//   { time: '12:00 PM', value: 98 },
//   { time: '2:00 PM', value: 97 },
//   { time: '4:00 PM', value: 98 },
//   { time: '6:00 PM', value: 99 },
//   { time: '8:00 PM', value: 98 },
// ];

// const temperatureData = [
//   { time: '6:00 AM', value: 98.2 },
//   { time: '8:00 AM', value: 98.4 },
//   { time: '10:00 AM', value: 98.6 },
//   { time: '12:00 PM', value: 98.3 },
//   { time: '2:00 PM', value: 98.5 },
//   { time: '4:00 PM', value: 98.4 },
//   { time: '6:00 PM', value: 98.2 },
//   { time: '8:00 PM', value: 98.1 },
// ];




function App() {
  // Data fetching state from remote
  const [sensorData, setSensorData] = useState([]);
  const [aiSummary, setAiSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [heartRateData, setHeartRateData] = useState([]);
  const [oxygenData, setOxygenData] = useState([]);
  const [temperatureData, setTemperatureData] = useState([]);
  
  // UI state from our changes
  const [showModal, setShowModal] = useState(false);
  const [tourStep, setTourStep] = useState(null); // null, 0, 1, or 2
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [favoritedStars, setFavoritedStars] = useState({
    heartRate: false,
    oxygenLevel: false,
    temperature: false
  });
  const healthMetricsRef = useRef(null);
  const healthInsightsRef = useRef(null);
  const wellnessSummaryRef = useRef(null);
  const videoRef = useRef(null);

  const toggleStar = (cardName) => {
    setFavoritedStars(prev => ({
      ...prev,
      [cardName]: !prev[cardName]
    }));
  };

  const tourContent = [
    {
      title: "Health Metrics",
      description: "Real-time graphs pull live data directly from AWS DynamoDB, giving you an up-to-the-minute view of your loved one's well-being. Every key metric is continuously refreshed, so you always have the most current picture of their health at a glance.",
      ref: healthMetricsRef
    },
    {
      title: "Health Insights",
      description: "Powered by NVIDIA NIM and Llama-3 reasoning, our system goes beyond raw numbers. It interprets trends, identifies meaningful patterns, and delivers clear, personalized insights — transforming data into guidance you can trust for better care decisions.",
      ref: healthInsightsRef
    },
    {
      title: "Wellness Summary",
      description: "Daily wellness summaries turn complex information into simple, human-friendly updates — helping you understand how your loved one is doing and offering gentle cues on how to support them with care and confidence.",
      ref: wellnessSummaryRef
    }
  ];

  const startTour = () => {
    setTourStep(0);
  };

  const nextStep = () => {
    if (tourStep < tourContent.length - 1) {
      setTourStep(tourStep + 1);
    } else {
      endTour();
    }
  };

  const prevStep = () => {
    if (tourStep > 0) {
      setTourStep(tourStep - 1);
    }
  };

  const endTour = () => {
    setTourStep(null);
  };

  // Handle video end - hide loading screen after one play
  const handleVideoEnd = () => {
    setShowLoadingScreen(false);
  };

  // Scroll to section when tour step changes
  useEffect(() => {
    if (tourStep !== null) {
      const currentStep = tourContent[tourStep];
      if (currentStep?.ref?.current) {
        // Small delay to ensure smooth animation
        setTimeout(() => {
          const offset = 100; // Offset for sticky header
          const elementPosition = currentStep.ref.current.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - offset;

          window.scrollTo({
            top: offsetPosition,
            behavior: 'smooth'
          });
        }, 100);
      }
    }
  }, [tourStep]);

  // Fetch data from FastAPI backend
  useEffect(() => {
    const fetchAndAnalyze = async () => {
      try {
        // 1️⃣ Pull latest Dynamo data
        const data = mockData;
        setSensorData(data);
  
        // 2️⃣ Split data into categories for charts
        const heartData = data
          .filter(d => d.sensor_type === "heart_rate" && !isNaN(Number(d.value)))
          .map(d => ({
            time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            value: Number(d.value)
          }));
  
        const oxygen = data
          .filter(d => d.sensor_type === "oxygen" && !isNaN(Number(d.value)))
          .map(d => ({
            time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            value: Number(d.value)
          }));
  
        const temp = data
          .filter(d => d.sensor_type === "temp_humidity")
          .map(d => {
            const match = /([\d.]+)°C/.exec(d.value);
            const val = match ? parseFloat(match[1]) : null;
            return {
              time: new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              value: val
            };
          })
          .filter(d => typeof d.value === "number" && !isNaN(d.value));
  
        setHeartRateData(heartData);
        setOxygenData(oxygen);
        setTemperatureData(temp);
  
        // 3️⃣ Send to FastAPI → NVIDIA NIM for reasoning
        const analyzeRes = await fetch("http://127.0.0.1:8000/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            posture: "sitting",
            pill_status: "closed",
            sensor_data: data,
          }),
        });
  
        const result = await analyzeRes.json();
        setAiSummary(result);
  
      } catch (err) {
        console.error("Error syncing data:", err);
      } finally {
        setLoading(false);
      }
    };
  
    // ✅ Run immediately
    fetchAndAnalyze();
  
    // ✅ Repeat every 30 seconds
    const interval = setInterval(fetchAndAnalyze, 30000);
    return () => clearInterval(interval);
  
  }, []); // <— Don't forget dependency array

  return (
    <div className="min-h-screen bg-transparent">
      {/* Loading Screen */}
      {showLoadingScreen && (
        <div className="fixed inset-0 bg-black z-[100] flex items-center justify-center">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            onEnded={handleVideoEnd}
          >
            <source src="/loadingscreen.mp4" type="video/mp4" />
            Your browser does not support the video tag.
          </video>
        </div>
      )}

      {/* Main Content - only show after loading */}
      {!showLoadingScreen && (
        <>
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="w-full py-6 flex items-center justify-between">
          <div className="flex items-center space-x-3 ml-6">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="h-10 w-auto"
            />
            <h1 className="text-3xl font-bold text-gray-800">nomi</h1>
          </div>
          <img 
            src="/edna.png" 
            alt="Profile" 
            className="h-12 w-12 rounded-full object-cover border-2 border-gray-200 mr-8"
          />
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 py-8">
      <div className="bg-gradient-to-r from-[#7BA05B] to-[#99B184] rounded-2xl p-8 text-white relative overflow-hidden">

          <div className="absolute top-4 left-6">

          </div>
          <div className="relative z-10">
            <h2 className="text-4xl font-bold mb-4">Meet Nomi — The sensor network that truly understands wellness</h2>
            <p className="text-xl mb-6 opacity-90">Monitor Edna's health with comprehensive wellness tracking and insights.</p>
            <div className="flex space-x-4">
              <button 
                onClick={() => setShowModal(true)}
                className="px-6 py-3 bg-white text-[#3B6E0E] rounded-lg font-medium hover:bg-gray-100 transition-colors"
              >
                View Reports
              </button>
              <button 
                onClick={startTour}
                className="px-6 py-3 bg-[#3B6E0E] text-white rounded-lg font-medium hover:bg-[#2f590b] transition-colors"
              >
                Take a Tour
              </button>
            </div>
          </div>
          <div className="absolute right-8 top-8 w-32 h-32 opacity-20">
            <div className="w-full h-full border-4 border-white rounded-full"></div>
            <div className="absolute top-4 left-4 w-24 h-24 border-4 border-white rounded-full"></div>
            <div className="absolute top-8 left-8 w-16 h-16 border-4 border-white rounded-full"></div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="px-6 pb-8">
        
        {/* Recent Health Metrics Section */}
        <div ref={healthMetricsRef} className="mb-8 scroll-mt-24">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-black">Health Metrics</h3>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Heart Rate Card */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center mr-4">
                    <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-black">Heart Rate</h4>
                    <p className="text-gray-600 text-sm">Real-time monitoring</p>
                  </div>
                </div>
                <button 
                  onClick={() => toggleStar('heartRate')}
                  className="w-6 h-6 focus:outline-none cursor-pointer transition-colors"
                >
                  <svg fill="currentColor" viewBox="0 0 20 20" className={favoritedStars.heartRate ? "text-yellow-400" : "text-gray-400"}>
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
              </div>
              <div className="h-48 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={heartRateData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#6b7280"
                      fontSize={10}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      fontSize={10}
                      domain={[65, 85]}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Bar dataKey="value" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-red-600">76</span>
                <span className="text-gray-600 ml-2">BPM</span>
              </div>
            </div>

            {/* Oxygen Card */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                    <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-black">Oxygen Level</h4>
                    <p className="text-gray-600 text-sm">Blood oxygen saturation</p>
                  </div>
                </div>
                <button 
                  onClick={() => toggleStar('oxygenLevel')}
                  className="w-6 h-6 focus:outline-none cursor-pointer transition-colors"
                >
                  <svg fill="currentColor" viewBox="0 0 20 20" className={favoritedStars.oxygenLevel ? "text-yellow-400" : "text-gray-400"}>
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
              </div>
              <div className="h-48 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={oxygenData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#6b7280"
                      fontSize={10}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      fontSize={10}
                      domain={[95, 100]}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                    />
                    <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-blue-600">98</span>
                <span className="text-gray-600 ml-2">%</span>
              </div>
            </div>

            {/* Temperature Card */}
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
                    <svg className="w-6 h-6 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-black">Temperature</h4>
                    <p className="text-gray-600 text-sm">Body temperature</p>
                  </div>
                </div>
                <button 
                  onClick={() => toggleStar('temperature')}
                  className="w-6 h-6 focus:outline-none cursor-pointer transition-colors"
                >
                  <svg fill="currentColor" viewBox="0 0 20 20" className={favoritedStars.temperature ? "text-yellow-400" : "text-gray-400"}>
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </button>
              </div>
              <div className="h-48 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={temperatureData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis 
                      dataKey="time" 
                      stroke="#6b7280"
                      fontSize={10}
                    />
                    <YAxis 
                      stroke="#6b7280"
                      fontSize={10}
                      domain={[98.0, 98.8]}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                      }}
                      formatter={(value) => [`${value}°F`, 'Temperature']}
                    />
                    <Bar dataKey="value" fill="#374151" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center">
                <span className="text-3xl font-bold text-gray-800">98.4</span>
                <span className="text-gray-600 ml-2">°F</span>
              </div>
            </div>
          </div>
        </div>

        {/* Health Insights Section */}
        <div ref={healthInsightsRef} className="mb-8 scroll-mt-24">
          <h3 className="text-2xl font-bold text-black mb-6">Health Insights</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
              <p className="text-gray-700">
                <span className="font-semibold text-red-600">Edna</span> is feeling well and active today. Her heart rate increased by 10% from yesterday, indicating a more energetic morning. 
                This is a good sign of her overall health and well-being. This could be a sign of a good night's sleep and a healthy lifestyle, be sure to encourage her to continue her healthy habits!
              </p>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
              <p className="text-gray-700">
                <span className="font-semibold text-blue-600">Edna</span> has a good oxygen level of 98%. This is an excellent oxygen level for her age and health. To increase her oxygen level, you can encourage her to take deep breaths, go for a walk, or practice yoga.
              </p>
            </div>
            <div className="bg-gray-50 border-l-4 border-gray-400 p-4 rounded-r-lg">
              <p className="text-gray-700">
                <span className="font-semibold text-gray-600">The temperature in Edna's room is 98.4°F. This is a normal temperature for her age and health. To maintain her comfort, you can adjust the temperature of the room to a comfortable level.</span>
              </p>
            </div>
          </div>
        </div>
        {/* Wellness Summary Section */}
        <div ref={wellnessSummaryRef} className="bg-white rounded-xl shadow-lg p-8 border border-gray-100 scroll-mt-24">
          <h3 className="text-2xl font-bold text-black mb-6">Wellness Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
              <p className="text-gray-700">
                <span className="font-semibold text-red-600">Edna</span> took her joint medication yesterday but hasn't taken it yet today.
              </p>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
              <p className="text-gray-700">
                <span className="font-semibold text-blue-600">Edna</span> last ate lunch at 1:02 PM.
              </p>
            </div>
            <div className="bg-gray-50 border-l-4 border-gray-400 p-4 rounded-r-lg">
              <p className="text-gray-700">
                <span className="font-semibold text-gray-600">Edna</span> slept 6 hours last night.
              </p>
            </div>
            <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded-r-lg">
              <p className="text-gray-700">
                <span className="font-semibold text-red-600">Edna</span> completed her morning walk at 8:30 AM.
              </p>
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
              <p className="text-gray-700">
                <span className="font-semibold text-blue-600">Edna</span> had a video call with her daughter this morning.
              </p>
            </div>
            <div className="bg-gray-50 border-l-4 border-gray-400 p-4 rounded-r-lg">
              <p className="text-gray-700">
                <span className="font-semibold text-gray-600">Edna</span> is feeling well and active today.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setShowModal(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 transform transition-all animate-slideUp relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Alert Icon */}
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            {/* Message */}
            <div className="text-center">
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Emergency Alert</h3>
              <p className="text-gray-700 text-lg leading-relaxed mb-6">
                Edna's heart rate dropped at 11:35 AM. Emergency email and text-message sent to Deborah's IPhone via AWS.
              </p>
              
              {/* Action Button */}
              <button
                onClick={() => setShowModal(false)}
                className="px-6 py-3 bg-[#3B6E0E] text-white rounded-lg font-medium hover:bg-[#2f590b] transition-colors w-full"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tour Overlay */}
      {tourStep !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-60 z-50 animate-fadeIn">
          {/* Highlight overlay with cutout for section */}
          <div className="relative w-full h-full">
            {/* Tour Card */}
            <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 w-full max-w-2xl px-4 animate-slideUp z-50">
              <div className="bg-white rounded-2xl shadow-2xl p-8 relative">
                {/* Step indicator */}
                <div className="flex justify-center mb-6 space-x-2">
                  {tourContent.map((_, index) => (
                    <div
                      key={index}
                      className={`h-2 rounded-full transition-all ${
                        index === tourStep
                          ? 'bg-[#3B6E0E] w-8'
                          : index < tourStep
                          ? 'bg-green-400 w-2'
                          : 'bg-gray-300 w-2'
                      }`}
                    />
                  ))}
                </div>

                {/* Content */}
                <div className="text-center mb-6">
                  <h3 className="text-3xl font-bold text-gray-900 mb-4">
                    {tourContent[tourStep].title}
                  </h3>
                  <p className="text-gray-700 text-lg leading-relaxed">
                    {tourContent[tourStep].description}
                  </p>
                </div>

                {/* Navigation Buttons */}
                <div className="flex justify-between items-center">
                  <button
                    onClick={prevStep}
                    disabled={tourStep === 0}
                    className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                      tourStep === 0
                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Previous
                  </button>

                  <button
                    onClick={endTour}
                    className="px-6 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                  >
                    Skip Tour
                  </button>

                  <button
                    onClick={nextStep}
                    className="px-6 py-3 bg-[#3B6E0E] text-white rounded-lg font-medium hover:bg-[#2f590b] transition-colors"
                  >
                    {tourStep === tourContent.length - 1 ? 'Finish' : 'Next'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}

export default App;
