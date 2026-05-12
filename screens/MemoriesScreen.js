import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  ScrollView,
} from 'react-native';

import StyledButton from '../components/StyledButton';
import Colors from '../constants/Colors';
import { generateRandomMemory } from '../components/HelperFunctions';
import { MEMORIES } from '../data/memories';

import MemoryItem from '../components/MemoryItem';

const MemoriesScreen = () => {
  const [memory, setMemory] = useState(null);
  const getMemory = () => {
    const item = generateRandomMemory(MEMORIES);
    // New object each tap so React updates even if random picks the same entry twice.
    setMemory(item ? { ...item } : null);
  };

  return (
    <>
      <ImageBackground
        style={styles.image}
        source={require('../assets/heartsBackground.jpg')}
      >
        <Text style={styles.headerText}>Our Special Memories!</Text>
        <ScrollView>
          {memory != null ? (
            <MemoryItem
              id={memory.id}
              title={memory.title}
              location={memory.location}
              description={memory.description}
              image={memory.image}
            />
          ) : (
            <View style={styles.memcontainer}>
              <Text style={styles.nomem}>Hit the Button Below!</Text>
            </View>
          )}
        </ScrollView>

        <StyledButton style={styles.button} onPress={getMemory}>
          Generate Random Memory
        </StyledButton>
      </ImageBackground>
    </>
  );
};

const styles = StyleSheet.create({
  image: {
    paddingVertical: 30,
    flex: 1,
    resizeMode: 'cover',
  },
  screen: { fontSize: 20 },
  button: {
    fontSize: 28,
    backgroundColor: Colors.purple,
    color: Colors.lightWhite,
  },
  headerText: {
    paddingVertical: 15,
    textAlign: 'center',
    fontFamily: 'balqis',
    fontSize: 40,
    color: Colors.purple,
  },
  memcontainer: {
    flex: 1,
    paddingVertical: 300,
    alignItems: 'center',
  },
  nomem: {
    textAlign: 'center',
    fontFamily: 'porcelain',
    fontSize: 45,
    color: Colors.purple,
  },
});

export default MemoriesScreen;
