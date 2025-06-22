'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MicrophoneIcon, 
  StopIcon, 
  SpeakerWaveIcon,
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline';

interface MicrophoneDemoProps {
  onTranscript: (transcript: string, isEmergency: boolean) => void;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export default function MicrophoneDemo({ onTranscript }: MicrophoneDemoProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [volume, setVolume] = useState(0);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Emergency keywords that trigger alerts
  const emergencyKeywords = [
    'mayday', 'emergency', 'pan pan', 'declaring emergency',
    'engine failure', 'bird strike', 'medical emergency', 
    'fuel emergency', 'fire', 'smoke', 'hydraulic failure',
    'lost engine', 'engine out', 'cardiac arrest', 'passenger down',
    'minimum fuel', 'emergency landing', 'priority landing'
  ];

  useEffect(() => {
    // Check if Web Speech API is supported
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        console.log('🎤 Voice recognition started');
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const fullTranscript = finalTranscript || interimTranscript;
        setTranscript(fullTranscript);

        // Check for emergency keywords
        const isEmergency = emergencyKeywords.some(keyword => 
          fullTranscript.toLowerCase().includes(keyword)
        );

        // Send transcript for processing if final and contains content
        if (finalTranscript.trim() && finalTranscript.length > 10) {
          console.log('🗣️ Processing transcript:', finalTranscript);
          onTranscript(finalTranscript, isEmergency);
        }
      };

      recognition.onerror = (event) => {
        console.error('🎤 Speech recognition error:', event);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        console.log('🎤 Voice recognition ended');
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, [onTranscript]);

  const startListening = async () => {
    if (!recognitionRef.current) return;

    try {
      // Start audio level monitoring
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      
      microphone.connect(analyser);
      analyser.fftSize = 256;
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      // Monitor audio levels
      const monitorAudio = () => {
        if (!analyserRef.current) return;
        
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);
        
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        setVolume(average);
        
        if (isListening) {
          requestAnimationFrame(monitorAudio);
        }
      };

      monitorAudio();
      recognitionRef.current.start();
    } catch (error) {
      console.error('🎤 Error accessing microphone:', error);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setVolume(0);
  };

  if (!isSupported) {
    return (
      <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
        <div className="flex items-center space-x-2 text-red-400">
          <ExclamationTriangleIcon className="w-5 h-5" />
          <span className="font-mono text-sm">Web Speech API not supported in this browser</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gray-900 border border-gray-600 rounded-lg p-4 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <MicrophoneIcon className="w-5 h-5 text-blue-400" />
          <h3 className="text-white font-mono text-sm font-bold">LIVE TRANSCRIPTION</h3>
        </div>
        <div className="text-xs text-gray-400 font-mono">
          {isListening ? 'LISTENING...' : 'READY'}
        </div>
      </div>

      {/* Microphone Controls */}
      <div className="flex items-center space-x-3">
        <button
          onClick={isListening ? stopListening : startListening}
          className={`p-3 rounded-full transition-all duration-200 ${
            isListening 
              ? 'bg-red-600 hover:bg-red-700 text-white' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isListening ? (
            <StopIcon className="w-6 h-6" />
          ) : (
            <MicrophoneIcon className="w-6 h-6" />
          )}
        </button>

        {/* Audio Level Indicator */}
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <SpeakerWaveIcon className="w-4 h-4 text-gray-400" />
            <div className="flex-1 bg-gray-700 rounded-full h-2">
              <motion.div
                className="bg-green-400 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (volume / 50) * 100)}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>
            <span className="text-xs text-gray-400 font-mono w-8">
              {Math.round((volume / 50) * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* Live Transcript */}
      <div className="bg-gray-800 border border-gray-600 rounded p-3 min-h-[200px]">
        <div className="text-xs text-gray-400 mb-2 font-mono">TRANSCRIPT:</div>
        <AnimatePresence>
          {transcript ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-white text-sm font-mono leading-relaxed"
            >
              {transcript}
            </motion.div>
          ) : (
            <div className="text-gray-500 text-sm font-mono italic">
              Click microphone to start transcribing...
            </div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
} 