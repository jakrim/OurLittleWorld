import React from 'react';
import { Image, StyleSheet, FlatList } from 'react-native';
import { MEMORIES } from '../data/memories';

import MemoryItem from '../components/MemoryItem';
import Card from './Card';
import { generateRandomMemory } from './HelperFunctions';

const Memory = (props) => {
  return (
    <Card style={styles.card}>
      <MemoryItem
        id={props.id}
        title={props.title}
        location={props.location}
        description={props.description}
        image={props.image}
      />
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    width: '100%'
    // justifyContent: 'center',
    // height: '100%',
    // opacity: 0.8,
  }
});

export default Memory;
