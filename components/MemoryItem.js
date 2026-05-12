import React from 'react';
import {
  View,
  StyleSheet,
  Image,
  Text,
  Dimensions,
  ScrollView,
} from 'react-native';
import Colors from '../constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import Card from './Card';

const MemoryItem = (props) => {
  return (
    <Card style={styles.memoryItem}>
      <View style={{ width: '100%' }}>
        <ScrollView
          minimumZoomScale={1}
          maximumZoomScale={5}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          scrollEnabled={true}
        >
          <View style={{ alignItems: 'center' }}>
            <Image source={props.image} style={styles.image} />
          </View>
        </ScrollView>
      </View>
      <Text style={styles.title}>{props.title}</Text>
      <Text style={styles.location}>
        <Ionicons
          name="location"
          size={24}
          color={Colors.primaryColor}
          style={styles.callTxt}
        />{' '}
        {props.location}
      </Text>
      {!!props.description?.trim() && (
        <View style={styles.description}>
          <Text style={styles.descriptionText}>{props.description}</Text>
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  memoryItem: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 10,
    backgroundColor: Colors.lightPink,
  },
  image: {
    width: Dimensions.get('window').width * 1.2,
    height: Dimensions.get('window').width * 1.2,
    // borderRadius: (Dimensions.get('window').width * 0.7) / 2,
    borderRadius: 10,
    // borderWidth: 0.5,
    borderColor: 'black',
    // overflow: 'hidden',
    resizeMode: 'contain',
    marginVertical: 5,
  },
  title: {
    paddingVertical: 3,
    fontFamily: 'balqis',
    fontSize: 26,
    color: Colors.pink,
    textAlign: 'center',
  },
  location: {
    fontSize: 22,
    color: Colors.pink,
    fontFamily: 'porcelain',
  },
  description: {
    padding: 5,
    backgroundColor: Colors.lightPink,
  },
  descriptionText: {
    textAlign: 'center',
    color: Colors.lightPurp,
    fontFamily: 'porcelain',
    fontSize: 20,
  },
});

export default MemoryItem;
