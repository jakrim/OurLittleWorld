import Memory from '../models/memory';

/** Curated memories: id, title, location, description, image require(). */
export const MEMORIES = [
  new Memory(
    '2',
    'I love you as a red head',
    'Salon Jennifer',
    'Why does this make me attracted to redheads now?!',
    require('../assets/images/1.jpeg')
  ),
  new Memory(
    '1',
    `The faces you make are too cute`,
    `Your bedroom`,
    `Your eyes and mouth make me want to kiss you so bad!!`,
    require('../assets/images/2.jpeg')
  ),

  new Memory(
    '3',
    'Purim Tel Aviv',
    'Kikar Hamedina',
    'This was when I learned we can have a GREAT time together! We partied all day (and slept all night!)',
    require('../assets/images/3.jpeg')
  ),
  new Memory(
    '4',
    'Cute Smiles',
    'Kikar Hamedina',
    `We had the best time! You put the facepaint on my face which didn't go with my outfit!`,
    require('../assets/images/4.jpeg')
  ),
  new Memory(
    '5',
    `Pre-Purim Festivities`,
    `מעונות איינשטיין`,
    `We loved this photoshoot! Did we plan to both wear jerseys or what?! And where did I get those glasses?!`,
    require('../assets/images/5.jpeg')
  ),
  new Memory(
    '6',
    `Our Famous Club Shot`,
    `I wish I knew!! (Please tell me I'll edit!)`,
    `Wow you look like a model here, we danced SO much that night, I remember clearly how cute you looked!!`,
    require('../assets/images/6.jpeg')
  ),
  new Memory(
    '7',
    `No Words`,
    `Beaches of TLV`,
    `So I sent you a photo of me in a tank top with my funny hat, and you send me THIS?!`,
    require('../assets/images/7.jpeg')
  ),
  new Memory(
    '8',
    `Shabbat at Haviv's`,
    `Kfar Varburg`,
    `My family came to visit and we all went to the Haviv's for shabbat. It was one of my happiest times in Israel, introducing you to my Israeli family!!`,
    require('../assets/images/8.jpeg')
  ),
  new Memory(
    '9',
    `Hiking in the North!`,
    `North Trip TAU`,
    `I couldn't take my eyes off of you! I thought you were so funny that day, and you looked so cute.`,
    require('../assets/images/9.jpeg')
  ),
  new Memory(
    '10',
    `Made it to the top!`,
    `North Trip TAU`,
    `We swapped hats and we were playfully chatting the entire time!!`,
    require('../assets/images/10.jpeg')
  ),
  new Memory(
    '11',
    `Lauren's love of birds`,
    `Amsterdam - Vondelpark`,
    `I guess you don't like birds! This is a keeper`,
    require('../assets/images/11.jpeg')
  ),
  new Memory(
    '12',
    `You're Quite the Model`,
    `Amsterdam`,
    `Oh the many faces of Lauren! ❤️`,
    require('../assets/images/12.jpeg')
  ),
  new Memory(
    '13',
    `Our Favorite Breakfast (Or lunch!)`,
    `Benedict's TLV`,
    `Wow.. when we'd order the cesar salad, two pancakes, avocado hummus, and fruit!`,
    require('../assets/images/13.jpeg')
  ),
  new Memory(
    '14',
    `Our MANY Tamaras`,
    `Tamara Yogurt`,
    `When I would order mine with EVERYTHING and you'd disappoint me with yours! 😜`,
    require('../assets/images/14.jpeg')
  ),
  new Memory(
    '15',
    `Famous Roadtrip`,
    `Dead Sea`,
    `I remember Bird Song by the Dead was playing, and we pulled over to take this photo, now it's a jigsaw puzzle in my room!`,
    require('../assets/images/15.jpeg')
  ),
  new Memory(
    '16',
    `On Top of the World`,
    `Masada`,
    `Does it get any better than that?! 300 meter ancient cliffs where the ancient Judeans fought... So epic and the best memory to share with you.`,
    require('../assets/images/16.jpeg')
  ),
  new Memory(
    '17',
    `Close Up`,
    `Masada`,
    `So we asked an Israeli to take a photo and he came WAY too close!!`,
    require('../assets/images/17.jpeg')
  ),
  new Memory(
    '18',
    `#views`,
    `Masada`,
    `Can you believe these views?! Take me back!`,
    require('../assets/images/15.jpeg')
  ),
  new Memory(
    '19',
    `Masada Hike!`,
    `Masada`,
    `We got there 45 minutes before the hike opened, and then I FORCED you to hike back down, but I'm so glad I did! I love to challenge you! ❤️`,
    require('../assets/images/19.jpeg')
  ),
  new Memory(
    '20',
    `Masada Sunrise`,
    `Masada`,
    `We had the choice of the BEST spot for the sunrise. It was so incredible, the best memory shared with you. We looked good for 6am!`,
    require('../assets/images/20-1.jpeg')
  ),
  new Memory(
    '21',
    `Masada Selfie`,
    `Masada`,
    `You look so gorgeous, now you see why I wanted to do everything with you!`,
    require('../assets/images/20-2.jpeg')
  ),
  // new Memory(
  //   '22',
  //   `Sunrise Selfie`,
  //   `Masada`,
  //   `Wow we nailed it! The best view in the world! ❤️`,
  //   require('../assets/images/20.png')
  // ),
  new Memory(
    '23',
    `Eilat Passover Dinner`,
    `Eilat`,
    `We drank wine outside and ate seafood, what could POSSIBLY be better. Let's do it again soon!`,
    require('../assets/images/21-1.jpeg')
  ),
  new Memory(
    '24',
    `Breaking Passover`,
    `Eilat`,
    `We needed to eat dinner, so we looked at the menu, and said "We MUST eat here look at the pastas!`,
    require('../assets/images/21.jpeg')
  ),
  new Memory(
    '25',
    `ATV Tour!`,
    `Eilat`,
    `We sketchily called some place, had to have someone DRIVE us there (why?!) it was so weird - but we had so much fun flying on the ATVs!!`,
    require('../assets/images/22.jpeg')
  ),
  new Memory(
    '26',
    `Lunch at the scuba docks!`,
    `Eilat`,
    `Having ate here with my friend Leith weeks earlier, taking you back was a DREAM! We got the table by the water and at the BEST shawarma... btw - is that SODA we're drinking?!`,
    require('../assets/images/23.jpeg')
  ),
  new Memory(
    '27',
    `What a View!`,
    `Eilat`,
    `Being in Eilat felt SO surreal. And I love that cute bathingsuit cover!`,
    require('../assets/images/24.jpeg')
  ),
  new Memory(
    '28',
    `Snorkel Trip!`,
    `Eilat`,
    `Wow.. forget scuba for a second, when we got the snorkel gear and swam for a WHILE down the beach along the coral reef walls... that was SO incredible.. we were hand in hand!`,
    require('../assets/images/25.jpeg')
  ),
  new Memory(
    '29',
    `Dinner in Eilat`,
    `Eilat`,
    `If you recall.. we were one of the only people at the restaurant, but because I ate here with my family, I had to take you!!`,
    require('../assets/images/26.jpeg')
  ),
  new Memory(
    '30',
    `Snuck a photo!`,
    `Eilat`,
    `Wow babe you can put on a wetsuit ANY day...`,
    require('../assets/images/27.jpeg')
  ),
  new Memory(
    '31',
    `Post Scuba`,
    `Eilat`,
    `I remember how scared you were... but you did SO great, and afterwards look at those gorgeous smiles!`,
    require('../assets/images/28.jpeg')
  ),
  new Memory(
    '32',
    `Showing the goods`,
    `Eilat`,
    `I LOVE this photo... hilarious and sexy at the same time!`,
    require('../assets/images/29.jpeg')
  ),
  new Memory(
    '33',
    `Post Scuba`,
    `Eilat`,
    `The kite surfers, the heat, the beach, good food, being together... why'd we ever leave?!`,
    require('../assets/images/30.jpeg')
  ),
  new Memory(
    '34',
    `Me.. You.. and Miles of Ancient Desert`,
    `Park Timna`,
    `We explored without worry, climbed without care, so excited to be in these ancient lands!`,
    require('../assets/images/31.jpeg')
  ),
  new Memory(
    '35',
    `Awesomeness`,
    `Park Timna`,
    `This photo is so cool, it was just me and you babe!`,
    require('../assets/images/32.jpeg')
  ),
  new Memory(
    '36',
    `Jess and Laur sittin' on a rock`,
    `Park Timna`,
    `I told you "I need a photo here" and we found a way to get the phone to stay!`,
    require('../assets/images/33.jpeg')
  ),
  new Memory(
    '37',
    `Lauren lookin GORG`,
    `Park Timna`,
    `I turned and said "Gimme something to work with!"`,
    require('../assets/images/34.jpeg')
  ),
  new Memory(
    '38',
    `You, I, and Timna`,
    `Park Timna`,
    `Exploring Timna with you was a dream of mine.. I was so excited to explore with you everywhere!! No cares!`,
    require('../assets/images/35.jpeg')
  ),
  new Memory(
    '39',
    `Made it to Mitzpe!`,
    `Mitzpe Ramon`,
    `We didn't get to our little "cabin in the desert" yet, I pulled over and said "Let's take a picture!"`,
    require('../assets/images/36.jpeg')
  ),
  new Memory(
    '40',
    `Us and the Negev`,
    `Mitzpe Ramon`,
    `This was one of my favorite stops on our trip!`,
    require('../assets/images/37.jpeg')
  ),
  new Memory(
    '41',
    `In the Crater!`,
    `Mitzpe Ramon`,
    `So many children laughing and playing on this rainfall pit.. we had to stop - and eat the malabi from the truck!`,
    require('../assets/images/38.jpeg')
  ),
  new Memory(
    '42',
    `Such an Amazing Journey`,
    `Mitzpe Ramon`,
    `Such an amazing place!!`,
    require('../assets/images/39.jpeg')
  ),
  new Memory(
    '43',
    `Desert Poses!`,
    `Mitzpe Ramon`,
    `Remember our car broke down in the middle of the road?!`,
    require('../assets/images/278.jpeg')
  ),
  new Memory(
    '44',
    `Struttin in Haifa`,
    `Haifa`,
    `This is the one and only stop I know of in Haifa!`,
    require('../assets/images/40.jpeg')
  ),
  new Memory(
    '45',
    `Gorgeous Views All Around`,
    `Rosh Hanikra`,
    `In the tram or on a porch at Rosh Hanikra!`,
    require('../assets/images/41-1.jpeg')
  ),
  new Memory(
    '46',
    `Splorin' the Caves!`,
    `Rosh Hanikra`,
    `I remember walking through the caves with you, I can remember the smell of the humid water and air!`,
    require('../assets/images/41.jpeg')
  ),
  new Memory(
    '47',
    `Hanikra or Greece!?`,
    `Rosh Hanikra`,
    `It was the most gorgeous weather, perfect temp, you look FLAWLESS! ❤️`,
    require('../assets/images/42.jpeg')
  ),
  new Memory(
    '48',
    `Perfect Day  ❤️`,
    `Rosh Hanikra`,
    `We had to go down by the water and get the close view!`,
    require('../assets/images/43.jpeg')
  ),
  new Memory(
    '49',
    `כֶּבֶשׂ`,
    `Unknown Village on the way to Tzfat`,
    `UM THE BEST SANDWICH IN THE WORLD!!`,
    require('../assets/images/44.jpeg')
  ),
  new Memory(
    '50',
    `Made it to Tzfat!`,
    `Tzfat`,
    `The first picture we took in Tzfat!`,
    require('../assets/images/45.jpeg')
  ),
  new Memory(
    '51',
    `Empty Streets of Tzfat`,
    `Tzfat`,
    `It was a ghost town! It was Friday and we weren't sure whether to drive or not. We decided to do it anyway!`,
    require('../assets/images/46.jpeg')
  ),
  new Memory(
    '52',
    `Sea of Galilee`,
    `Galilee`,
    `We pulled over just to take this photo! It was a perfect view!`,
    require('../assets/images/47.jpeg')
  ),
  new Memory(
    '53',
    `Where the F are We?!`,
    `Unknown`,
    `One of the prettiest views I have EVER seen. Winds were 40km, hair and your dress everywhere, but a COMPLETELY unforgetable moment.`,
    require('../assets/images/48.jpeg')
  ),
  new Memory(
    '54',
    `Quick Peek to Caesarea`,
    `Caesarea`,
    `We got there and it was closed, and we never went back together, but we got a picture!`,
    require('../assets/images/49.jpeg')
  ),
  new Memory(
    '55',
    `Last Day of our Trip`,
    `Namal TLV`,
    `We LOVED to have fun and take funny pics! We need to do this more ❤️`,
    require('../assets/images/50.jpeg')
  ),
  new Memory(
    '56',
    `Made it in Time for the Sunset`,
    `Namal TLV`,
    `We searched for a parking spot, I told the guy "Give me 5 minutes!" and we jumped out and ran to the boardwalk!`,
    require('../assets/images/51.jpeg')
  ),
  new Memory(
    '57',
    `Homemade Schnitzel!`,
    `מעונות ברושים`,
    `We cooked SO many meals in my kitchen! I loved EVERY MINUTE OF IT!! ❤️`,
    require('../assets/images/52.jpeg')
  ),
  new Memory(
    '58',
    `Leaning into the "Couple" Label`,
    `Student Party`,
    `One of the last nights of Israel, we had such a great time that night with all our friends!!`,
    require('../assets/images/53.jpeg')
  ),
  new Memory(
    '59',
    `CUTIE!`,
    `Gordon Beach TLV`,
    `You're SO CUTE! We ate dinner, ate chocolate cake, and relaxed here until the sun set completely!`,
    require('../assets/images/54.jpeg')
  ),
  new Memory(
    '60',
    `I was so in LOVE`,
    `Gordon Beach TLV`,
    `Look at that cute smile!! I was so in love with you!`,
    require('../assets/images/55.jpeg')
  ),
  new Memory(
    '61',
    `I have no words.`,
    `Gordon Beach TLV`,
    `You are SO adorable. I love you so much! ❤️`,
    require('../assets/images/56.jpeg')
  ),
  new Memory(
    '62',
    `Your Dorm!`,
    `מעונות איינשטיין`,
    `Damn girl you gorgeous!! Summer, and no cares at all!`,
    require('../assets/images/57.jpeg')
  ),
  new Memory(
    '63',
    `Your Dorm!`,
    `מעונות איינשטיין`,
    `So we can be uncoordinated and STILL look amazing!`,
    require('../assets/images/58.jpeg')
  ),
  new Memory(
    '64',
    `Your Dorm!`,
    `מעונות איינשטיין`,
    `Look how HAPPY we were!! I want to feel like this EVERY DAY! ❤️`,
    require('../assets/images/59.jpeg')
  ),
  new Memory(
    '65',
    `Top of the Crane!!`,
    `יום הסטודנט`,
    `How Israeli was being lifted by a giant crane over TAU campus!? SO FUN!!`,
    require('../assets/images/60.jpeg')
  ),
  new Memory(
    '66',
    `Last breakfast at Benedicts`,
    `Benedicts`,
    `I changed my birthday on the website to April... and we got that free bottle of Champagne!`,
    require('../assets/images/61.jpeg')
  ),
  new Memory(
    '67',
    `Our last trip to Jerusalem`,
    `הכותל`,
    `We both LOVED seeing these soldiers. Such a beautiful afternoon with you!`,
    require('../assets/images/62.jpeg')
  ),
  new Memory(
    '68',
    `Jerusalem Rooftop`,
    `Mamilla Mall`,
    `We were with out Zahal veteran Tomer, he brought us to the roof where we had an incredible view!`,
    require('../assets/images/63.jpeg')
  ),
  new Memory(
    '69',
    `Paris in Israel`,
    `Jerusalem Streets`,
    `The Jerusalem light festival! I convinced you to come with me, we walked all over, and this was incredible!`,
    require('../assets/images/64.jpeg')
  ),
  new Memory(
    '70',
    `Moon was closed!`,
    `Somewhere close to Moon!`,
    `Moon was being remodeled, חבל, I popped this warm bottle of champagne, and the cork HIT THE CEILING!!`,
    require('../assets/images/65.jpeg')
  ),
  new Memory(
    '71',
    `Beach nights`,
    `קרוב לשלוותה`,
    `We must have been leaving Shalvata and wanted to walk on the beach! How'd you get my phone?!`,
    require('../assets/images/66.jpeg')
  ),
  new Memory(
    '72',
    `Pose!`,
    `קרוב לשלוותה`,
    `I definitely made you sit on this bunny so I can take a picture of my bunny! ❤️`,
    require('../assets/images/67.jpeg')
  ),
  new Memory(
    '73',
    `Ben Gurion Goodbyes`,
    `בן גוריון`,
    `This was definitely our saddest moment together... I couldn't stop crying after you left! The feelings were REAL!`,
    require('../assets/images/68.jpeg')
  ),
  new Memory(
    '74',
    `Studying Together!`,
    `בקמפוס`,
    `I LOVED sitting on the grass and doing hebrew, and after I met you, you'd join me (and we'd laugh)!`,
    require('../assets/images/69.jpeg')
  ),
  new Memory(
    '75',
    `One Week Later!`,
    `Newark Airport`,
    `SO JOYOUS! It was so SURREAL seeing you in the States! I'll never forget how beautiful you looked!`,
    require('../assets/images/70.jpeg')
  ),
  new Memory(
    '76',
    `Exploring Ridgewood!`,
    `Ridgewood, NJ`,
    `We got ice cream and ate it in the park across the street! SO American!`,
    require('../assets/images/71.jpeg')
  ),
  new Memory(
    '77',
    `Let Them Eat Cake!`,
    `527 Old Post Road`,
    `We came back from Ridgewood to TWO cakes! One for each of us!`,
    require('../assets/images/72.jpeg')
  ),
  new Memory(
    '78',
    `Ferry to NYC`,
    `Hoboken Ferry`,
    `We too incredible of a view of Manhattan NOT to take a picture, even with the crazy wind!`,
    require('../assets/images/74.jpeg')
  ),
  // new Memory(
  //   '79',
  //   `One World Trade`,
  //   `NYC`,
  //   `Took the ferry in, walked 400ft to the One World Trade! The views were amazing!`,
  //   require('../assets/images/75.jpeg')
  // ),
  new Memory(
    '80',
    `Streets of NYC`,
    `NYC`,
    `Such a perfect day! I wanted to take you EVERYWHERE! And I did!`,
    require('../assets/images/76.jpeg')
  ),
  new Memory(
    '81',
    `Lauren in NYC!`,
    `Streets of NY`,
    `I wanted to make you laugh the WHOLE day, and I did! By taking photos of you EVERYWHERE!! ❤️`,
    require('../assets/images/77.jpeg')
  ),
  new Memory(
    '82',
    `NYC Pimpin`,
    `Topman in NYC`,
    `Had to put on this fancy jacket, you came onto me immediately!`,
    require('../assets/images/78.jpeg')
  ),
  new Memory(
    '83',
    `Oh Fancy Me`,
    `Shopping NYC`,
    `You look marvelous darling!!`,
    require('../assets/images/79.jpeg')
  ),
  new Memory(
    '84',
    `NYC Cab`,
    `NYC`,
    `Your first yellow cab ride! Maybe?! On the way to the highline!`,
    require('../assets/images/80.jpeg')
  ),
  new Memory(
    '85',
    `Lauren + Highline`,
    `Highline`,
    `So excited you were doing all the NYC things with me!`,
    require('../assets/images/81.jpeg')
  ),
  new Memory(
    '86',
    `Lauren + Art`,
    `Highline`,
    `THIS was the funniest.. we couldn't get over how weird this was!!`,
    require('../assets/images/82.jpeg')
  ),
  new Memory(
    '87',
    `Couples ❤️`,
    `Highline`,
    `You looked so cute and the weather was SO nice! Can't wait to do it again.`,
    require('../assets/images/83.jpeg')
  ),
  new Memory(
    '88',
    `Cutie with the Helicopters!`,
    `Highline`,
    `It was cool seeing 4 or 5 helis taking off close to us! Had to snag a quickie!`,
    require('../assets/images/84.jpeg')
  ),
  new Memory(
    '89',
    `Lauren with a NYC Horse!`,
    `Streets of NYC`,
    `Horse and Lauren!!`,
    require('../assets/images/85.jpeg')
  ),
  new Memory(
    '90',
    `Broadway with the Fam!`,
    `Broadway`,
    `After an exhausting day, we made it to the broadway show! Les Misérables?!`,
    require('../assets/images/86.jpeg')
  ),
  new Memory(
    '91',
    `Holding up Traffic`,
    `Streets of NYC`,
    `VIPs coming through!`,
    require('../assets/images/87.jpeg')
  ),
  new Memory(
    '92',
    `Lauren's FIRST broadway show!`,
    `Les Misérables`,
    `At Intermission: Jesse, "Well, did you like it?" (egging you on), Lauren, "It was great!" 😜`,
    require('../assets/images/88.jpeg')
  ),
  new Memory(
    '93',
    `Our favorite!`,
    `Les Misérables`,
    `SO much fun! Can't wait for more broadway shows together!`,
    require('../assets/images/89.jpeg')
  ),
  new Memory(
    '94',
    `Turning any Situation into a Laugh`,
    `NJ Train!`,
    `We really know how to laugh and smile!`,
    require('../assets/images/90.jpeg')
  ),
  new Memory(
    '95',
    `Lauren and Loonies!`,
    `Crazy NYC`,
    `What a crazy city! Your face says it all!`,
    require('../assets/images/91.jpeg')
  ),
  new Memory(
    '96',
    `On our way to Madame Tussauds`,
    `Times Square`,
    `Doing the most touristy things imaginable!`,
    require('../assets/images/92.jpeg')
  ),
  new Memory(
    '97',
    `Lauren's first NYC Pizza!`,
    `NYC Pizza`,
    `Why do you look even more gorgeous with pizza in your mouth!`,
    require('../assets/images/93.jpeg')
  ),
  new Memory(
    '98',
    `You gonna eat all that?`,
    `Hershey Store`,
    `I can't believe you bought all of that...`,
    require('../assets/images/94.jpeg')
  ),
  new Memory(
    '99',
    `Starting to Embrace All the Photos`,
    `Times Square`,
    `You're gorgeous darling!!`,
    require('../assets/images/95.jpeg')
  ),
  new Memory(
    '100',
    `Lauren and Lucy!`,
    `Madame Tussauds`,
    `Work it girl!! So fun being there with you!`,
    require('../assets/images/96.jpeg')
  ),
  new Memory(
    '101',
    `No biggie, just us and GOLDA!`,
    `Madame Tussauds`,
    `We're the same height! What a woman!`,
    require('../assets/images/97.jpeg')
  ),
  new Memory(
    '102',
    `First Eataly!`,
    `Eataly NYC!`,
    `You had raviolis and I had the ragus!`,
    require('../assets/images/98.jpeg')
  ),
  new Memory(
    '103',
    `Good ole' Matthew's Diner!`,
    `Matthew's Diner`,
    `Sharin' eggs and chocolate chip pancakes, our favorite! ❤️`,
    require('../assets/images/99.jpeg')
  ),
  new Memory(
    '104',
    `Lauren and Lexi ❤️`,
    `Richie and Joan's NJ`,
    `Your first meeting!! Eeeeeeeeeeee`,
    require('../assets/images/100.jpeg')
  ),
  // new Memory(
  //   '105',
  //   `My Hippy Girl!`,
  //   `Dundas`,
  //   `The moment I met you I thought you looked like the cutest hippy girl ❤️`,
  //   require('../assets/images/101.png')
  // ),
  // new Memory(
  //   '106',
  //   `#Selfieeee`,
  //   `Snapchat`,
  //   `One of your many lewks! ❤️`,
  //   require('../assets/images/102.png')
  // ),
  new Memory(
    '107',
    `Train to Toronto!`,
    `Aldershot`,
    `On our way to some fun adventures!`,
    require('../assets/images/103.jpeg')
  ),
  new Memory(
    '108',
    `10/10 Would Kiss`,
    `Train to Toronto`,
    `Love our many festivities!`,
    require('../assets/images/104.jpeg')
  ),
  new Memory(
    '109',
    `❤️ First Time in Toronto Together ❤️`,
    `Toronto Distillery District`,
    `❤️ We saw this heart and I said we NEED a photo here!! ❤️`,
    require('../assets/images/105.jpeg')
  ),
  new Memory(
    '110',
    `You make drinking a beer CLASSY`,
    `Toronto Distillery District`,
    `I loved your cute outfit! We had the best day!`,
    require('../assets/images/106.jpeg')
  ),
  new Memory(
    '111',
    `Mill Street!`,
    `Toronto Distillery District`,
    `We drank a pitcher and definitely felt a little buzz!`,
    require('../assets/images/107.jpeg')
  ),
  new Memory(
    '112',
    `Damn We Cute!`,
    `Toronto Distillery District`,
    `Love our many selfies ❤️`,
    require('../assets/images/108.jpeg')
  ),
  new Memory(
    '113',
    `My FB profile pic! (Maybe it's time..)`,
    `Toronto Distillery District`,
    `Damn we look cute!`,
    require('../assets/images/109.jpeg')
  ),
  new Memory(
    '114',
    `Cibo!`,
    `Cibo, Toronto`,
    `When I learned Cibo was in Toronto, I knew we had to go!`,
    require('../assets/images/110.jpeg')
  ),
  new Memory(
    '115',
    `CN Tower Selfie! 2017`,
    `Toronto`,
    `After we ate at Cibo, and walking around! The tower was so new to me!`,
    require('../assets/images/111.jpeg')
  ),
  new Memory(
    '116',
    `First Time!`,
    `The Collins, Dundas`,
    `WOW you turned me on to the cheesy spin-dip!`,
    require('../assets/images/112.jpeg')
  ),
  new Memory(
    '117',
    `First Time at Konzelmann`,
    `Niagara on the Lake`,
    `When we picked up that funny little booklet that gave us free tastings!!`,
    require('../assets/images/113.jpeg')
  ),
  new Memory(
    '118',
    `That Random Fair`,
    `NY State Fair`,
    `We drove, parked, had a BALL! So many games and rides and food!`,
    require('../assets/images/114.jpeg')
  ),
  new Memory(
    '119',
    `Kissing on my bed!`,
    `Park Point Syracuse`,
    `Babe I MISS this!!`,
    require('../assets/images/115.jpeg')
  ),
  new Memory(
    '120',
    `Sunset pic with no sunset!`,
    `Syracuse University`,
    `You look SO cute!! We must have had a great weekend ❤️`,
    require('../assets/images/116.jpeg')
  ),
  new Memory(
    '121',
    `On Top of the World!`,
    `Dundas Peak`,
    `Might have been my first time up there! I remember we used to park illegally ALL the time! Too many tickets... 😝`,
    require('../assets/images/117.jpeg')
  ),
  new Memory(
    '122',
    `I LOVE this pic!`,
    `Dundas Peak`,
    `Doesn't look like you!! 😝😝 You look CUTE!`,
    require('../assets/images/118.jpeg')
  ),
  new Memory(
    '123',
    `Niagara Mini-Golf`,
    `Clifton Hill`,
    `One of our MANY competitive rounds of mini-golf!`,
    require('../assets/images/119.jpeg')
  ),
  new Memory(
    '124',
    `This pic is GOLD!`,
    `Maiden of the Mist`,
    `Babe we NAILED this pic!!!!`,
    require('../assets/images/120.jpeg')
  ),
  new Memory(
    '125',
    `Look at All Them Chickens!`,
    `Maiden of the Mist`,
    `Look at that falls!! ❤️ Need to do this again!`,
    require('../assets/images/121.jpeg')
  ),
  new Memory(
    '126',
    `I LOVE CANADA!`,
    `Niagara Gift Shop`,
    `I needed to wear EVERYTHING! I love to make you laugh!!`,
    require('../assets/images/122.jpeg')
  ),
  // new Memory(
  //   '127',
  //   `That Look!!`,
  //   `???`,
  //   `I Found that Someone Who Looks at Me Special!`,
  //   require('../assets/images/123.png')
  // ),
  new Memory(
    '128',
    `White Wine or BudLights, and Salmon!`,
    `Park Point Syracuse`,
    `Senior year where we cooked together! Look at all that parmesan!`,
    require('../assets/images/124.jpeg')
  ),
  new Memory(
    '129',
    `Hiking in Cuse!`,
    `Clark Reservation`,
    `So glad we share a love of nature!`,
    require('../assets/images/125.jpeg')
  ),
  new Memory(
    '130',
    `I love my views!`,
    `Parking Garage!`,
    `Look at that campus! Miss being there with you!`,
    require('../assets/images/126.jpeg')
  ),
  new Memory(
    '131',
    `Syracuse Football!`,
    `The Carrier Dome`,
    `Had to give you the full sports experience!`,
    require('../assets/images/127.jpeg')
  ),
  new Memory(
    '132',
    `Buzzed Fun on the Couch!`,
    `Senior Apartment`,
    `Look how young and cute we look!! 🍊`,
    require('../assets/images/128.jpeg')
  ),
  new Memory(
    '133',
    `Laurier Game Day!`,
    `Laurier University`,
    `Where did I get this cow bell from!? So fun! Also the day I lost my whistler sweatshirt. 🤦‍♂️🤦‍♂️`,
    require('../assets/images/129.jpeg')
  ),
  new Memory(
    '134',
    `My 22nd Birthday!`,
    `Steak place in Syracuse`,
    `What a special night!!! (Yes I DID ask for free dessert! The nerve of this place!)`,
    require('../assets/images/130.jpeg')
  ),
  new Memory(
    '135',
    `That Time We Went Go Karting!`,
    `Destiny USA Syracuse`,
    `We had such a blast!! Remember when we played that basketball game waiting and didn't it hit me in the head?!`,
    require('../assets/images/131.jpeg')
  ),
  new Memory(
    '136',
    `What are you Wearing?!`,
    `Destiny USA Syracuse`,
    `Wow babe you like to party!! We got those stickers at the mirror maze!!`,
    require('../assets/images/132.jpeg')
  ),
  new Memory(
    '137',
    `First Bite of Dino Poutine!`,
    `Dino BBQ`,
    `Just as good as Canada!! Look at how happy you are! My Chinese girlfriendd! ❤️❤️`,
    require('../assets/images/133.jpeg')
  ),
  // new Memory(
  //   '138',
  //   `We're so Adventurous!`,
  //   `5 Wits!`,
  //   `We played Space, Egypt, Pirates, it was the BEST!`,
  //   require('../assets/images/134.png')
  // ),
  new Memory(
    '139',
    `❤️❤️ Fall Activities ❤️❤️`,
    `Syracuse Apple Picking`,
    `This was so much fun!! We need to go this Fall!`,
    require('../assets/images/135.jpeg')
  ),
  new Memory(
    '140',
    `You Deserve the World!`,
    `Dundas`,
    `Babe your smile brings so much joy and happiness to me! ❤️❤️`,
    require('../assets/images/136.jpeg')
  ),
  // new Memory(
  //   '141',
  //   `Arrest me Occifer!`,
  //   `Halloween`,
  //   `Can you be a sexy cop this year!? Or lend me that outfit!`,
  //   require('../assets/images/137.png')
  // ),
  new Memory(
    '142',
    `Partyin!`,
    `Stag and Doe - Dundas`,
    `I had the best time with you betting on the Goldfish!! I'm pretty sure I won 10 loonies!!`,
    require('../assets/images/138.jpeg')
  ),
  new Memory(
    '143',
    `You and Chet!`,
    `Your Room`,
    `You're both such mooshies!! ❤️`,
    require('../assets/images/139.jpeg')
  ),
  new Memory(
    '144',
    `Look at that smile!!`,
    `Hiking in Ithaca`,
    `That road trip to Ithica to see the gorges! The waterfalls were so amazing! We didn't know where we were going but so glad we went!`,
    require('../assets/images/140.jpeg')
  ),
  new Memory(
    '145',
    `🍊SU Basketball🍊`,
    `Carrier Dome`,
    `SO glad we got a photo together with Otto the Orange!!`,
    require('../assets/images/141.jpeg')
  ),
  new Memory(
    '146',
    `You Should Model`,
    `Ithaca? Dundas?`,
    `Love our MANY hikes and adventures!`,
    require('../assets/images/142.jpeg')
  ),
  new Memory(
    '147',
    `Drove to you after your dentist!`,
    `Dundas-ish`,
    `We met next to a bridge by the water to spend the weekend together!`,
    require('../assets/images/143.jpeg')
  ),
  new Memory(
    '148',
    `Deciding to Ice Skate!`,
    `Nathan Phillips Square`,
    `Before we skated! Having such a fun night ❤️`,
    require('../assets/images/144.jpeg')
  ),
  new Memory(
    '149',
    `Huggies!`,
    `Konzelmann Winery`,
    `When we snuck out the back and walked to the water and Gazebo!`,
    require('../assets/images/145.jpeg')
  ),
  new Memory(
    '150',
    `Holiday Market!`,
    `Distillery Toronto`,
    `Love EVERY time we go here!! We have so much fun, especially when I'm not kicked out of the store!`,
    require('../assets/images/146.jpeg')
  ),
  new Memory(
    '151',
    `Skating in The Six!`,
    `Nathan Phillips Square`,
    `We need to do this sooooon!!! More winter activities please!!`,
    require('../assets/images/147.jpeg')
  ),
  new Memory(
    '152',
    `Gimme Some Attitude`,
    `Golfview Crescent`,
    `These onesies were the best purchase EVER!! You hawt gurl!`,
    require('../assets/images/148.jpeg')
  ),
  new Memory(
    '153',
    `NYC With Lauren`,
    `Washington Square Park`,
    `I miss those SOFT cheeks!!`,
    require('../assets/images/149.jpeg')
  ),
  // new Memory(
  //   '154',
  //   `Relationship Goals`,
  //   `527 Old Post Road`,
  //   `❤️ I LOVE US ❤️`,
  //   require('../assets/images/150.png')
  // ),
  new Memory(
    '155',
    `MAGA`,
    `Some Airport`,
    `YES I made you do this, and I'm pretty happy I did!`,
    require('../assets/images/151.jpeg')
  ),
  new Memory(
    '156',
    `Cabo Life`,
    `Cabo Beach`,
    `This trip was so fun babe! Can you believe we were together for less than a year?!`,
    require('../assets/images/152.jpeg')
  ),
  // new Memory(
  //   '157',
  //   `We won the Shamps!`,
  //   `Cabo`,
  //   `Babe you deserved it! So fun hanging in the pool with youuuu.`,
  //   require('../assets/images/153.png')
  // ),
  new Memory(
    '158',
    `Yacht Life`,
    `Cabo`,
    `Let's get a boat! We belong on the water and IN the water. ❤️`,
    require('../assets/images/154.jpeg')
  ),
  new Memory(
    '159',
    `Family in Mexio`,
    `Cabo Resort`,
    `Can't wait to get back in a Pool!`,
    require('../assets/images/155.jpeg')
  ),
  new Memory(
    '160',
    `Party Rock in the House Tonight`,
    `Squid Roe`,
    `This night was EPIC, club was so cool, drinks were flowin, my shirt was OFF, Todd and sibs were lit, what a time to be alive!!`,
    require('../assets/images/156.jpeg')
  ),
  new Memory(
    '161',
    `Dinner in Cabo`,
    `Restaurante`,
    `This was such a great dinner! We had a mariachi band come sing to us, and the fooooddd`,
    require('../assets/images/157.jpeg')
  ),
  new Memory(
    '162',
    `Look at that View!`,
    `Cabo Beach`,
    `Babe spending this time on vacay with you was the best thing ever... I miss it!`,
    require('../assets/images/158.jpeg')
  ),
  new Memory(
    '163',
    `Chilly on the Beach`,
    `The Office`,
    `The best cesar salad and shrimp scampi of my lifeee!`,
    require('../assets/images/159.jpeg')
  ),
  new Memory(
    '164',
    `Holy Moly`,
    `Cabo I think!`,
    `What kinda hair is that?!`,
    require('../assets/images/160.jpeg')
  ),
  new Memory(
    '165',
    `My Happy Place`,
    `Camp Gaw, NJ`,
    `Can't wait to take you back skiing (You need a lesson!).`,
    require('../assets/images/161.jpeg')
  ),
  new Memory(
    '166',
    `Drunky Monkey`,
    `Ediths, Lunch in Cabo`,
    `Ummm the funniest! The scampi in the daiquiri was so good!`,
    require('../assets/images/162.jpeg')
  ),
  new Memory(
    '167',
    `Tequila Sunrise`,
    `Cabo`,
    `Sun bathing,snorkeling, and the open bar on the big boat was so fun!!`,
    require('../assets/images/163.jpeg')
  ),
  new Memory(
    '168',
    `Lauren and the Pup!`,
    `Dundas`,
    `Our love for doggies is the BEST! So glad we share that!`,
    require('../assets/images/164.jpeg')
  ),
  new Memory(
    '169',
    `A Brisk Day, Perfect for a Nice Walk`,
    `Hamilton Botanical Gardens`,
    `The water was beautiful, snow on the groundm we were bundled up, yet went outside anyway!`,
    require('../assets/images/165.jpeg')
  ),
  new Memory(
    '170',
    `Girls`,
    `Syracuse`,
    `Too cute not to post!`,
    require('../assets/images/166.jpeg')
  ),
  new Memory(
    '171',
    `Best Dressed`,
    `Syracuse`,
    `You have the best sense of humor my love!`,
    require('../assets/images/167.jpeg')
  ),
  new Memory(
    '172',
    `Bundled Up`,
    `Syracuse`,
    `When I kept my room too cold and walked in to THIS!`,
    require('../assets/images/168.jpeg')
  ),
  new Memory(
    '173',
    `Struttin on the Quad`,
    `Syracuse`,
    `Such a beautiful campus and it was the best of both worlds having you there with me!`,
    require('../assets/images/169.jpeg')
  ),
  new Memory(
    '174',
    `Hey 19!`,
    `TAU`,
    `We showed up, we partied, we kissed, and we may have then fallen asleep early. Amazing night!! Mazel Tov! 😜`,
    require('../assets/images/170.jpeg')
  ),
  new Memory(
    '175',
    `Night out in Toronto`,
    `Toronto`,
    `I love this picture of you, you are gorgeous from head to toe and I'm such a lucky man!`,
    require('../assets/images/171.jpeg')
  ),
  new Memory(
    '176',
    `Twiddle!`,
    `Syracuse`,
    `Taking you to Twiddle was SO fun because I knew you'd love it!! We had a blast!`,
    require('../assets/images/172.jpeg')
  ),
  new Memory(
    '177',
    `Birthday at St. James!`,
    `St. James Espresso Bar`,
    `We ate with Josh and Syd and had such a great time!!`,
    require('../assets/images/173.jpeg')
  ),
  new Memory(
    '178',
    `Tews Falls`,
    `Dundas Conservation Area`,
    `We followed some crazy kid down the side of a few cliffs, and made it to the bottom of the falls! Then we had to find our way back up! What an adventure!`,
    require('../assets/images/174.jpeg')
  ),
  new Memory(
    '179',
    `Steep Climbing!`,
    `Dundas Conservation Area`,
    `Wow after the most epic adventure yet in Dundas! We climbed up some random hill HOPING it was the right one to the trail!`,
    require('../assets/images/175.jpeg')
  ),
  new Memory(
    '180',
    `Adventures on the Peak!`,
    `Dundas Peak`,
    `Love this dysfunctional picture! The wind was strong and the air was warm! Such a great memory. ❤`,
    require('../assets/images/176.jpeg')
  ),
  // new Memory(
  //   '181',
  //   `Mayfest!`,
  //   `SU`,
  //   `Such a CRAZY day, my favorite day of the year! We partied all day long!`,
  //   require('../assets/images/177.png')
  // ),
  new Memory(
    '182',
    `Trying new Breakfast Places!`,
    `Syracuse`,
    `We were on our way to Ithaca and got this recommendation!`,
    require('../assets/images/178.jpeg')
  ),
  new Memory(
    '183',
    `Beauty with Beauty`,
    `Ithaca is Gorges`,
    `Had the best time walking down these beautiful falls with you!`,
    require('../assets/images/179.jpeg')
  ),
  new Memory(
    '184',
    `Syracuse Graduation`,
    `Syracuse`,
    `Loved having you with me!! So exciting and sad at the same time!`,
    require('../assets/images/180.jpeg')
  ),
  new Memory(
    '185',
    `Graduation Beer Pong`,
    `Comstock`,
    `We need to play more beerpong soon!! So much fun having you as my partner!`,
    require('../assets/images/181.jpeg')
  ),
  new Memory(
    '186',
    `On our way to Ottawa!`,
    `Kingston, ON`,
    `Had to stop for Woodenheads and ice cream!!`,
    require('../assets/images/182.jpeg')
  ),
  new Memory(
    '187',
    `Bruins vs. Senators Playoffs!`,
    `Canadian Tire Centre`,
    `So much fun sneaking around to good seats with you! We had to go to staples to print the tickets beforehand! 😂`,
    require('../assets/images/183.jpeg')
  ),
  new Memory(
    '188',
    `Made it to the Capitol!`,
    `Ottawa`,
    `So much fun seeing the capitol and being in Ottawa for the first time splorin'!`,
    require('../assets/images/184.jpeg')
  ),
  new Memory(
    '189',
    `Canoeing in Ottawa!`,
    `Ottawa`,
    `Me, You, and a Canoe! For two hourssss, the best! ❤️`,
    require('../assets/images/185.jpeg')
  ),
  new Memory(
    '190',
    `One of Our Favourite Pics`,
    `Ottawa`,
    `❤️ Love in the tulip garden. ❤️`,
    require('../assets/images/186.jpeg')
  ),
  new Memory(
    '191',
    `Doe!`,
    `NYC`,
    `When we met Simona and went to the TRENDIEST place in NYC!`,
    require('../assets/images/187.jpeg')
  ),
  new Memory(
    '192',
    `Two Queens`,
    `Wax Museum`,
    `I always laugh when I think of how into the Royals you are/were! I love it cutie! ❤️`,
    require('../assets/images/188.jpeg')
  ),
  new Memory(
    '193',
    `Foolin Around!`,
    `Toronto`,
    `Who looks better?!`,
    require('../assets/images/189.jpeg')
  ),
  new Memory(
    '194',
    `Our happy place!`,
    `Trattoria Nervosa`,
    `We must have eaten here 10 times by now! Can't get that Mafaldi out of my head!`,
    require('../assets/images/190.jpeg')
  ),
  new Memory(
    '195',
    `Adventures on the Lake`,
    `Lake Eerie`,
    `First time ever being there! It was so fun! Felt just like a beach day! Let's go back, as long as you wear that same bathingsuit! 😜❤️`,
    require('../assets/images/191.jpeg')
  ),
  new Memory(
    '196',
    `Selfies in Your Room`,
    `15 Golfview Crescent`,
    `I love us! ❤️❤️`,
    require('../assets/images/192.jpeg')
  ),
  new Memory(
    '197',
    `Canoe in NYC`,
    `Central Park`,
    `With Maia, Jordan, and Maia's niece. Such a fun adventure! And we saw some cute turtles! ❤️`,
    require('../assets/images/193.jpeg')
  ),
  // new Memory(
  //   '198',
  //   `Quick Wine Pitstop`,
  //   `Two Sisters`,
  //   `You met my fam here on our Canada trip, we hung out just you and I for a little before going to dinner and our parents meeting!`,
  //   require('../assets/images/194.jpeg')
  // ),
  new Memory(
    '199',
    `Surrey Bikes at the Jersey Shore`,
    `Cape May`,
    `A MUST to take you here! It was where I grew up going every summer for beach vacations with my family!`,
    require('../assets/images/195.jpeg')
  ),
  new Memory(
    '200',
    `Nothing like Kohr Bros`,
    `Downtown Cape May`,
    `That softserve is the best! So glad I can share this memory and experience with you baby! ❤️`,
    require('../assets/images/196.jpeg')
  ),
  new Memory(
    '201',
    `You Won!`,
    `Wildwood Piers NJ`,
    `You beat me!!! She was so cute, so glad we won!! That's the best boardwalk experience!`,
    require('../assets/images/197.jpeg')
  ),
  new Memory(
    '202',
    `More like Motel`,
    `Sunset Beach Hotel NJ`,
    `We laid sleeping bags over the bed, and showering was less sanitary than not! We made the most of it!! #budgeting ❤️`,
    require('../assets/images/198.jpeg')
  ),
  new Memory(
    '203',
    `Electric Bikes up Mont Royal!`,
    `Mont Royal Peak`,
    `THIS was unforgettable. If not for the bikes we would have never made it! Had the absolute best time biking with you all over the park!`,
    require('../assets/images/199.jpeg')
  ),
  new Memory(
    '204',
    `Birthday Dinner!`,
    `Bonaparte Restaurant`,
    `My 22nd birthday in Montreal! So glad we spent it together ❤️`,
    require('../assets/images/200.jpeg')
  ),
  new Memory(
    '205',
    `Egg Crepes`,
    `Quebec City`,
    `One of the most unique breakfasts we've ever had!! SOO good, let's go back!`,
    require('../assets/images/201.jpeg')
  ),
  new Memory(
    '206',
    `The Best Personality`,
    `Quebec City Fort`,
    `You'd make a hellofa royal guard my love! ❤️`,
    require('../assets/images/202.jpeg')
  ),
  new Memory(
    '207',
    `Pumpkins`,
    `Quebec City`,
    `You're such a cutie!!`,
    require('../assets/images/203.jpeg')
  ),
  new Memory(
    '208',
    `Dueces Losers`,
    `Quebec City`,
    `Nice pose girl! So fun climbing on the cannons with you down by the water!`,
    require('../assets/images/204.jpeg')
  ),
  new Memory(
    '209',
    `The prettiest town in North America`,
    `Quebec City`,
    `SO quaint, SO cute, and exploring it with you was my dream! ❤️`,
    require('../assets/images/205.jpeg')
  ),
  new Memory(
    '210',
    `You Crushed TedX`,
    `TedX Laurier`,
    `I was SO proud of you for doing this (and jealous!), it was incredible and I'm so happy I could be there!`,
    require('../assets/images/206.jpeg')
  ),
  new Memory(
    '211',
    `Toronto Raptors!`,
    `Scotiabank Arena`,
    `So much fun! Too bad Drake wasn't there! Can't wait to do it again!`,
    require('../assets/images/207.jpeg')
  ),
  new Memory(
    '212',
    `Spontaneous Plans!`,
    `Grease Toronto`,
    `We got last minute tickets, the theater was so cool with the leaves, and we loved the show and singing along!`,
    require('../assets/images/208.jpeg')
  ),
  new Memory(
    '213',
    `You & Ariel`,
    `West Palm Beach Florida`,
    `You're both so cute! So much fun with you in Florida, ALWAYS! ❤️`,
    require('../assets/images/209.jpeg')
  ),
  new Memory(
    '214',
    `Making Dreams Come True`,
    `Disney Magic Kingdom`,
    `We went to three or four parks in two days! We did as much as we possibly could, it was SO tiring but SO FUN! Remember that paella dinner at Disney Walk?!`,
    require('../assets/images/210.jpeg')
  ),
  new Memory(
    '215',
    `Thing 1 and Thing 2`,
    `Universal Studios`,
    `We did ALL the kiddy rides! And some real ones, the fast passes were worth it! Such a blast being with you love! ❤️`,
    require('../assets/images/211.jpeg')
  ),
  new Memory(
    '216',
    `Joan and Richie!`,
    `107 Victoria Bay Court`,
    `Spending time with you and my grandparents is the best!! "We can't get them out of the bedroom!"-Richie`,
    require('../assets/images/212.jpeg')
  ),
  new Memory(
    '217',
    `Sebastian!`,
    `Syracuse`,
    `We decided to meet in Syracuse ONE random Saturday in January... I checked Ribbon, and guess who was playing?! Not before Dino BBQ though!`,
    require('../assets/images/213.jpeg')
  ),
  new Memory(
    '218',
    `Fruity Pebble French Toast`,
    `Modern Malt`,
    `No words... the most delicious and HIP breakfast spot! Loved going there with you! ❤️`,
    require('../assets/images/214.jpeg')
  ),
  new Memory(
    '219',
    `Our Relationship in a Picture`,
    `Whittman Business School`,
    `Walking around and needed lunch! What's better than the tastiest cesar wrap and a glass window view of campus!`,
    require('../assets/images/215.jpeg')
  ),
  new Memory(
    '220',
    `First Visit to SF`,
    `San Francisco`,
    `On our first day! We ventured out in search of avocado toast! It was a leather jacket kinda day!`,
    require('../assets/images/216.jpeg')
  ),
  new Memory(
    '221',
    `Sailing Away`,
    `San Francisco Bay`,
    `What an adventure! Captain Phil was a nut job and he loved having us SO much! Such a unique experience!!! ❤️❤️❤️`,
    require('../assets/images/217.jpeg')
  ),
  new Memory(
    '222',
    `Steering the Ship!`,
    `San Francisco Bay`,
    `We took the wheel and I sailed it under the bridge at sunset while you held two drinks and laughed at me!! One of the best moments of my life. ❤️`,
    require('../assets/images/218.jpeg')
  ),
  new Memory(
    '223',
    `Electric Bikes over the Bridge`,
    `Golden gate Bridge`,
    `Babe we biked 20 miles at LEAST that day! We saw the WHOLE city, and went into Marin county for a seafood lunch! Thank G-d for the electric pedaling!`,
    require('../assets/images/219.jpeg')
  ),
  new Memory(
    '224',
    `Drove our Smart Car to Carmel`,
    `Carmel by the Sea`,
    `We REALLY snuck this day trip in last minute! Trying to find a car to rent, (I needed a fun one!) and we drove down the BEAUTIFUL coast! Such an adventure from morning to sunset!`,
    require('../assets/images/220.jpeg')
  ),
  new Memory(
    '225',
    `Look at That View!`,
    `Twin Peaks, SF`,
    `We did a little bit of walking or climbing to get to this view, the tallest peak in all of SF! I remember it vividly! Definitely was a little cold and windy!`,
    require('../assets/images/221.jpeg')
  ),
  new Memory(
    '226',
    `I Wanted You to Get That Jacket!`,
    `Haight Street, SF`,
    `We went vintage clothes shopping! But didn't buy anything! Super fun though. ❤️`,
    require('../assets/images/222.jpeg')
  ),
  new Memory(
    '227',
    `Professional Roadtrip!`,
    `10X Las Vegas`,
    `What a weekend! We really crushed it together as a power couple and met some great people! We need to go to a future one! 10X BABY!!!`,
    require('../assets/images/223.jpeg')
  ),
  new Memory(
    '228',
    `Top of the Ferris Wheel`,
    `High Roller`,
    `Open bar on the tallest ferris wheel in the world! WOW, 4 drinks each in 30 minutes, that's a deal!!`,
    require('../assets/images/224.jpeg')
  ),
  new Memory(
    '229',
    `Prettiest Birthday Girl!`,
    `Trattoria Nervosa`,
    `Your 21st birthday at Nervosa! Wow we went for 21 AND 22! It doesn't get any better than that! 😝`,
    require('../assets/images/225.jpeg')
  ),
  new Memory(
    '230',
    `Dress Shopping for the Durgan Wedding`,
    `Toronto`,
    `Loved seeing you try on all these dresses! You looked STUNNING in all of them, even with your hair not being "done" 😝😝`,
    require('../assets/images/226.jpeg')
  ),
  new Memory(
    '231',
    `Birthday Celebration with Friends!`,
    `Hamilton`,
    `We went somewhere in the Hamilton area with Josh, Syd, Spencer and Bronwyn! Love seeing that face!`,
    require('../assets/images/227.jpeg')
  ),
  new Memory(
    '232',
    `Look at that Champs Popping Face!`,
    `Niagara Falls`,
    `We stayed in the WACKIEST hotel but look at that view!! We partied pretty damn hard that night love!`,
    require('../assets/images/228.jpeg')
  ),
  new Memory(
    '233',
    `That IHOP was DANK`,
    `Niagara Falls`,
    `We had so much fun your 21st bday weekend, all the games on the Canadian side, and a STEAK DINNER! YUM!`,
    require('../assets/images/229.jpeg')
  ),
  new Memory(
    '234',
    `Many Falls Trips`,
    `Niagara Falls`,
    `All bundled up in April for your 21st bday at the falls! It doesn't stop being fun!`,
    require('../assets/images/230.jpeg')
  ),
  new Memory(
    '235',
    `MY FAVE Barton G`,
    `Barton G. Miami`,
    `I don't care what you say - those $30 cocktails are worth it!! That's the experience! 😝`,
    require('../assets/images/231.jpeg')
  ),
  new Memory(
    '236',
    `Dress Shopping for the Durgan Wedding ❤️`,
    `Toronto`,
    `Loved seeing you try on all these dresses! You looked STUNNING in all of them, even with your hair not being "done" 😝😝`,
    require('../assets/images/233.jpeg')
  ),
  // new Memory(
  //   '237',
  //   `Durgan Denka Wedding`,
  //   `Ocean Reef Club, Key West FL`,
  //   `Such a fun weekend celebrating our good friends, so thankful to know them! Can't wait to spend more time all together! ❤ You looked beautiful in your dresses! And we danced SO MUCH!!! ❤️`,
  //   require('../assets/images/232.jpeg')
  // ),
  new Memory(
    '238',
    `A Miami Staple`,
    `Vizcaya Gardens, Miami`,
    `Cool history, gorgeous gardens on the water, so much fun exploring them with you! And we ate authentic Cuban food after!`,
    require('../assets/images/234.jpeg')
  ),
  new Memory(
    '239',
    `Paint Date`,
    `NYC`,
    `So glad your mom still has this in her office! We had so much fun with Maia, Jordan, and Jillian!`,
    require('../assets/images/235.jpeg')
  ),
  new Memory(
    '240',
    `Hiking in Mount Charleston`,
    `Mt Charleston, Las Vegas`,
    `This is my dream playground, G-d's country. Taking you here after all the hours I spent exploring it was SO fun! So much beauty and I can't wait for many more hikes together!`,
    require('../assets/images/236.jpeg')
  ),
  // new Memory(
  //   '241',
  //   `Kissing in Mount Charleston`,
  //   `Mt Charleston, Las Vegas`,
  //   `Your lips, that mountain where we just hiked... So much fun! Sorry I pushed you so hard. ❤️❤️`,
  //   require('../assets/images/237.png')
  // ),
  new Memory(
    '242',
    `Birthday Dinner in Vegas`,
    `Zuma at the Cosmo`,
    `Can you believe I lived 15 minutes from the Cosmo! I need to have a house there with you, a gorgeous pool, and a view of the strip in the future. ❤️❤️`,
    require('../assets/images/238.jpeg')
  ),
  new Memory(
    '243',
    `We Made It!`,
    `Las Vegas`,
    `Remember the Elvis impersonator who wanted to come in the photo?! 😝`,
    require('../assets/images/239.jpeg')
  ),
  new Memory(
    '244',
    `Lauren and Carlo`,
    `The Venetian`,
    `So much fun exploring "Venice" with my love. Remember the turtle desserts we ate over the balcony outside!? ❤️`,
    require('../assets/images/240.jpeg')
  ),
  new Memory(
    '245',
    `That Time We Almost Got Hitched`,
    `Neon Museum, Vegas`,
    `The best Vegas wedding! We're going back to renew our vows (when the time comes)!`,
    require('../assets/images/241.jpeg')
  ),
  new Memory(
    '246',
    `Are we Crazy?!`,
    `Helicopter over Redrock Canyon`,
    `This scared the shit out of both of us, but what an incredible adventure! The beauty was SO much to take in! Can't wait to do it again!`,
    require('../assets/images/242.jpeg')
  ),
  new Memory(
    '247',
    `Another birthday dinner in Vegas?!`,
    `Spago, Bellagio Vegas`,
    `Can you say Richhhhhhh. Such a great dinner with the best view of the water show! Remember how tiny the pasta dishes were?! For $25?! 😂`,
    require('../assets/images/243.jpeg')
  ),
  new Memory(
    '248',
    `In our Favorite Place`,
    `Trattoria Nervosa`,
    `Okay seriously this is the 4th or 5th photo of us here in this slideshow... 😂😂 You need more PARM!!!`,
    require('../assets/images/244.jpeg')
  ),
  new Memory(
    '249',
    `Ashley and Luke's Wedding!`,
    `Fairmont Royal York`,
    `Damn we looked SO good here! We danced, took shots with your parents, ate good food, talked with your great aunt and grandpa, laughed at how over the top, what a blast!`,
    require('../assets/images/245.jpeg')
  ),
  new Memory(
    '250',
    `Jared's Bday`,
    `Mickey Museum, NYC`,
    `This was cute! And we stayed in the city to start the Phish run!!`,
    require('../assets/images/246.jpeg')
  ),
  new Memory(
    '251',
    `Phish NYE 2019`,
    `Madison Square Garden`,
    `This made me SO happy!! Such a great party and for you to experience all the balloons, the best place to be on New Years (no argument)!`,
    require('../assets/images/247.jpeg')
  ),
  new Memory(
    '252',
    `Jamie and Layna's Wedding`,
    `Seasons, NJ`,
    `Such a cute night, sitting with you, talking to Shannon and Kristin, dancing! You said to me "I'm not even that drunk!" (turns to Jordan) "Don't tell Jesse I'm wasted". So much fun!!`,
    require('../assets/images/248.jpeg')
  ),
  new Memory(
    '253',
    `❤️ Monty ❤️`,
    `Leslie's house`,
    `Babe Monty was so cute, so loved, and he LOVED you! You were his good friend. ❤️❤️`,
    require('../assets/images/249.jpeg')
  ),
  new Memory(
    '254',
    `On the Court`,
    `BallenIsles West Palm`,
    `You were SO good!! Something we need to do more! You will seriously be a natural in no time! Love you!!`,
    require('../assets/images/250.jpeg')
  ),
  new Memory(
    '255',
    `The Gorgeous Birthday Girl!`,
    `Trattoria Nervosa`,
    `Lagos bracelet AANNDD Mafaldi?! Such a great lunch!!`,
    require('../assets/images/251.jpeg')
  ),
  new Memory(
    '256',
    `22nd Birthday at Nervosa!`,
    `Trattoria Nervosa`,
    `Mafaldi, Bracelet, Wine, and Dessert! The best lunch in the world with my favorite lady on her bday. ❤️`,
    require('../assets/images/252.jpeg')
  ),
  new Memory(
    '257',
    `Exploring the other Falls!`,
    `Webster Falls Dundas`,
    `I LOVE making you laugh! Look at that cute face! So fun exploring the beautiful nature around you! ❤️`,
    require('../assets/images/253.jpeg')
  ),
  new Memory(
    '258',
    `On the way to Comedy in NYC`,
    `Carolines on Broadway`,
    `What a FUN night! We ate REAL sushi (menu in Japanese), then met John and friends at the comedy club. So funny when Big Jay Oakerson called you out!`,
    require('../assets/images/254.jpeg')
  ),
  new Memory(
    '259',
    `Gorgeous Day in Central Park`,
    `Central Park`,
    `Lauren you sure you want to wear those shoes? 30 minutes later... 😂 On the way to the MOMA with Jordan and Tilly, we stopped to eat gelato at the restaurant near the lake, and did some walking in central park. Such a beautiful day with you!`,
    require('../assets/images/255.jpeg')
  ),
  // new Memory(
  //   '260',
  //   `Central Park Walk`,
  //   `Central Park`,
  //   `I cherish every minute I spend with you! Look at those glasses! 🤩`,
  //   require('../assets/images/256.png')
  // ),
  new Memory(
    '261',
    `The Honeycomb with the Sibs!`,
    `The Vessel`,
    `First breakfast at the Smith, then lots of stairs to burn it off! Walked through the mall and got ice cream!`,
    require('../assets/images/257.jpeg')
  ),
  new Memory(
    '262',
    `Walks with the Puppies`,
    `Franklin Lakes Reservation`,
    `These puppers were exhausted!! So fun walking with you babe! ❤️`,
    require('../assets/images/258.jpeg')
  ),
  new Memory(
    '263',
    `Changing it up in The 6`,
    `Gusto 101`,
    `So while we felt like we cheated on Nervosa, it was really good and the rooftop was super fun! Lets go back! Love our outfits cutie! ❤️`,
    require('../assets/images/259.jpeg')
  ),
  new Memory(
    '264',
    `Skyline for Dayzzz`,
    `Toronto Island`,
    `Sitting on a bench with nothing to do, "What's over there?" I asked, "Toronto Island" you said, "We both said "Let's go!". Fun time biking around the whole island on a HOT summer day! Then we got ice cream at the end!`,
    require('../assets/images/260.jpeg')
  ),
  new Memory(
    '265',
    `Niagara Mini Golf`,
    `Clifton Hill, Niagara`,
    `I love competing with you in mini golf, YOU HAD THE HARDEST HOLE IN 1 ON THE COURSE!!! REMEMBER?!!?! 🤩`,
    require('../assets/images/261.jpeg')
  ),
  new Memory(
    '266',
    `US Side`,
    `Niagara Falls State Park`,
    `We had to check out the US side just once right? It had one good thing going for it - a great view of Canada! 🇨🇦`,
    require('../assets/images/262.jpeg')
  ),
  new Memory(
    '267',
    `Jesse's birthday in Montreal`,
    `Maggie Oaks Restaurant`,
    `This place was SO good, we got the best recommendation! I loved this dinner so much, so many good meats! You had the ribs, and I got the entrecôte!`,
    require('../assets/images/263.jpeg')
  ),
  new Memory(
    '268',
    `Classy Cafes`,
    `Montreal`,
    `Such dank to-go breakfast sandwiches and coffee before we scootered all over the city!!`,
    require('../assets/images/264.jpeg')
  ),
  new Memory(
    '269',
    `Scooter Fun in Montreal!`,
    `The Entire city of Montreal`,
    `The most EPIC tour around ANY city, I feel like I know the whole place now! From going around the racetrack, to up on the Mountain and the mansions, to the city streets, we did it all! And our French tourguide was so funny!`,
    require('../assets/images/265.jpeg')
  ),
  // new Memory(
  //   '270',
  //   `Jared & Annie's Wedding`,
  //   `The Broadmoor, Colorado`,
  //   `One of the best weekends celebrating my brother and now sister-in-law! So cute and great being a part of the party. So happy you were with me! ❤️❤️`,
  //   require('../assets/images/266-1.png')
  // ),
  new Memory(
    '271',
    `Edge Walk`,
    `CN Tower, Toronto`,
    `Um, THE most epic experience of our lives! I cannot believe that we hung off the tower!! My little smurffff ❤️❤️❤️`,
    require('../assets/images/266.jpeg')
  ),
  new Memory(
    '272',
    `Cocktails and Laughs!`,
    `Not Sure!`,
    `All I know is we look like we had a GREAT time! I love us!! ❤️`,
    require('../assets/images/267.jpeg')
  ),
  new Memory(
    '273',
    `Rooftop Birthday Dinner`,
    `Les Enfants Terribles, Montreal`,
    `Such a GORGEOUS restaurant and I'm so glad we found it! The best birthday dinner I've ever had! ❤️❤️❤️`,
    require('../assets/images/268.jpeg')
  ),
  new Memory(
    '274',
    `G-d's Country!`,
    `Garden of the Gods`,
    `So fun running around with you - and running into my WHOLE family! Parking illegally but had NO problem at all! I'm a pro. 😝😝`,
    require('../assets/images/269.jpeg')
  ),
  new Memory(
    '275',
    `Worth it for the Photo`,
    `Garden of the Gods`,
    `I'm so glad we got out and walked around! I LOVE the views all around Colorado. You are adorable and I love you! ❤️`,
    require('../assets/images/270.jpeg')
  ),
  new Memory(
    '276',
    `Pretty Woman`,
    `The Broadmoor, CO`,
    `Damn girl!! I was obsessed with you all night. My GORGEOUS date!! You ROCKED that dress! I couldn't stop peeking!`,
    require('../assets/images/271.jpeg')
  ),
  new Memory(
    '277',
    `In Love`,
    `The Broadmoor, CO`,
    `Such a great weekend walking everywhere with you. I wanted you by my side every minute! So glad you spent time with Maia! You're so cute! ❤️❤️`,
    require('../assets/images/272.jpeg')
  ),
  new Memory(
    '278',
    `My Angel!`,
    `Selfies`,
    `Look at you Gorgeous!!! I LOVE YOU!`,
    require('../assets/images/273.jpeg')
  ),
  new Memory(
    '279',
    `Favorite Sushi on the Planet`,
    `Miku Toronto`,
    `Um... it really doesn't get ANY better than Miku's Aburi Sushi! 🤩`,
    require('../assets/images/274.jpeg')
  ),
  new Memory(
    '280',
    `WE DID IT`,
    `CN Tower`,
    `We conquered our fears together! I may have acted like I wasn't scared, but I WAS!! You're the best, best birthday present EVER!! 🤩`,
    require('../assets/images/275.jpeg')
  ),
  new Memory(
    '281',
    `Snowy Falls`,
    `Dundas`,
    `This proves we can have fun ANYWHERE! You yelled at me for going ANY closer! 😂`,
    require('../assets/images/276.jpeg')
  ),
  new Memory(
    '282',
    `Walking in the Sun`,
    `Burlington Waterfront`,
    `Loved walking around Burlington with you! Love doing ANYTHING with you!`,
    require('../assets/images/277.jpeg')
  ),
  new Memory(
    '283',
    `Stranded`,
    `Mitzpe Ramon`,
    `REMEMBER WHEN THE CAR STALLED IN THE MIDDLE OF THE DESERT! So funny it kept giving us heart attacks!! 😝😂`,
    require('../assets/images/278.jpeg')
  ),
];
