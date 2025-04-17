// Cleaned App.js (JavaScript version) for Expo - No TypeScript

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { Camera } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import Tesseract from 'tesseract.js';

export default function App() {
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraRef, setCameraRef] = useState(null);
  const [loading, setLoading] = useState(false);
  const [imageUri, setImageUri] = useState(null);
  const [cardName, setCardName] = useState('');
  const [rulings, setRulings] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const runOCR = async (imageUri) => {
    const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
    const { data: { text } } = await Tesseract.recognize(`data:image/jpeg;base64,${base64}`, 'eng');
    return text;
  };

  const cleanText = (text) => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 2)
      .map(line => line.replace(/[^a-zA-Z\s]/g, ''))
      .sort((a, b) => b.length - a.length)[0] || '';
  };

  const fetchRulingsWithFallback = async (name) => {
    try {
      const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
      const cardData = await res.json();
      if (cardData && cardData.rulings_uri) {
        const rulingsRes = await fetch(cardData.rulings_uri);
        const rulingData = await rulingsRes.json();
        setRulings(rulingData.data);
        setSuggestions([]);
      } else {
        throw new Error('Card not found');
      }
    } catch (error) {
      const fallback = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(name)}`);
      const fallbackData = await fallback.json();
      if (fallbackData && fallbackData.data) {
        setRulings([]);
        setSuggestions(fallbackData.data.slice(0, 3));
      }
    }
  };

  const handleScan = async () => {
    if (!cameraRef) return;
    setLoading(true);
    const photo = await cameraRef.takePictureAsync({ quality: 1 });
    setImageUri(photo.uri);

    const cropped = await ImageManipulator.manipulateAsync(
      photo.uri,
      [{ crop: { originX: 0, originY: photo.height * 0.3, width: photo.width, height: photo.height * 0.2 } }],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
    );

    try {
      const rawText = await runOCR(cropped.uri);
      const cleaned = cleanText(rawText);
      setCardName(cleaned);
      await fetchRulingsWithFallback(cleaned);
    } catch (e) {
      console.error('OCR Error:', e);
      setRulings([{ comment: 'OCR or fetch error.' }]);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  if (!Camera || !Camera.Type) {
    return <View><Text>Loading camera module...</Text></View>;
  }

  if (hasPermission === null) return <View><Text>Requesting camera permission...</Text></View>;
  if (hasPermission === false) return <View><Text>No access to camera.</Text></View>;

  return (
    <View style={styles.container}>
      <Camera style={styles.camera} ref={ref => setCameraRef(ref)} ratio="16:9" type="back" />
      <TouchableOpacity onPress={handleScan} style={styles.button}>
        <Text style={styles.buttonText}>Scan Card</Text>
      </TouchableOpacity>
      {loading && <ActivityIndicator size="large" color="limegreen" style={{ margin: 10 }} />}
      {imageUri && <Image source={{ uri: imageUri }} style={styles.preview} />}
      <Text style={styles.detected}>{cardName ? `Detected: ${cardName}` : ''}</Text>
      <ScrollView style={styles.results}>
        {rulings.length > 0 && rulings.map((r, i) => (
          <Text key={i} style={styles.ruling}><Text style={{ fontWeight: 'bold' }}>{r.published_at}:</Text> {r.comment}</Text>
        ))}
        {suggestions.length > 0 && (
          <View style={{ padding: 10 }}>
            <Text style={{ color: 'white' }}>Card not found. Did you mean:</Text>
            {suggestions.map((s, i) => (
              <Text key={i} style={styles.suggestion}>{s}</Text>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  camera: { flex: 1 },
  button: {
    position: 'absolute', bottom: 30, alignSelf: 'center',
    backgroundColor: 'limegreen', padding: 15, borderRadius: 10
  },
  buttonText: { color: 'black', fontWeight: 'bold' },
  preview: { width: '100%', height: 150, resizeMode: 'contain', marginTop: 10 },
  detected: { textAlign: 'center', color: 'white', marginVertical: 10 },
  results: { paddingHorizontal: 15 },
  ruling: { color: 'white', marginBottom: 8 },
  suggestion: { color: 'skyblue', marginTop: 5 },
});
