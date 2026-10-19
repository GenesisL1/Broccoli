/*
 * Broccoli — GenesisL1's open-source search results clustering engine.
 * Copyright (c) 2026 Decentralized Science Labs LLC. MIT License.
 *
 * Stop words and stop labels for German, French, Spanish, Italian,
 * Portuguese, Dutch and Russian, compiled for Broccoli: articles, pronouns,
 * prepositions and their contractions, conjunctions, auxiliary and modal
 * verb forms, common adverbs and small numbers. As in English, stop words
 * may appear inside a label but never start or end one.
 */

const words = (s) => s.trim().split(/\s+/);

export const STOPWORDS_DE = words(`
der die das den dem des ein eine einer eines einem einen kein keine keiner keines keinem keinen
ich du er sie es wir ihr mich dich sich uns euch mir dir ihm ihn ihnen ihrer ihres ihre ihren ihrem
sein seine seiner seines seinem seinen mein meine meiner meines meinem meinen dein deine deiner
deines deinem deinen unser unsere unserer unseres unserem unseren euer eure eurer eures eurem euren
man jemand niemand jeder jede jedes jedem jeden jener jene jenes jenem jenen dieser diese dieses
diesem diesen welcher welche welches welchem welchen derselbe dieselbe dasselbe denselben demselben
desselben solche solcher solches solchem solchen alle allem allen aller alles beide beiden einige
einigen einiger einiges manche manchen mancher manches viele vielen vieler wenige wenigen etwas
nichts selbst
an am ans auf aufs aus bei beim bis durch für fürs gegen hinter in im ins mit nach neben ohne seit
über überm um unter vom von vor während wegen zu zum zur zwischen trotz statt anstatt außer
innerhalb außerhalb gemäß laut mittels samt entlang bezüglich hinsichtlich aufgrund infolge
und oder aber denn sondern doch dass daß ob weil wenn als wie da damit obwohl obgleich sowie
sowohl weder noch entweder bzw beziehungsweise falls sofern indem nachdem bevor ehe sobald solange
bin bist ist sind seid war warst waren wart sei seien wäre wären gewesen habe hast hat haben habt
hatte hattest hatten hattet hätte hätten gehabt werde wirst wird werden werdet wurde wurdest
wurden wurdet würde würden geworden worden kann kannst können könnt konnte konnten könnte könnten
muss muß musst müssen müsst musste mussten müsste müssten soll sollst sollen sollt sollte sollten
will willst wollen wollt wollte wollten darf darfst dürfen dürft durfte durften dürfte mag magst
mögen möchte möchten
nicht nur auch schon sehr so dann hier dort wo wann warum wieso weshalb was wer wem wen wessen
immer nie oft manchmal bereits etwa eher mehr weniger meist meistens ganz gar kaum sogar jedoch
dennoch also zudem außerdem ferner usw etc ja nein nun jetzt heute bisher daher deshalb deswegen
somit dabei dafür dagegen danach darauf daraus darin darum darüber davon davor dazu hierbei hierzu
hiermit wobei womit worin worauf woraus insbesondere besonders vielmehr ebenso ebenfalls jeweils
eins zwei drei vier fünf sechs sieben acht neun zehn erste ersten erster erstes zweite zweiten
zweiter dritte dritten z.b. d.h. u.a. vs ca
`);

export const STOPWORDS_FR = words(`
le la les l' un une des du de d' au aux ce cet cette ces mon ma mes ton ta tes son sa ses notre nos
votre vos leur leurs je j' tu il elle on nous vous ils elles me m' te t' se s' lui eux moi toi soi
y en qui que qu' quoi dont où lequel laquelle lesquels lesquelles duquel auquel auxquels auxquelles
desquels desquelles celui celle ceux celles ceci cela ça c' tout tous toute toutes autre autres
même mêmes chaque plusieurs quelque quelques aucun aucune certain certains certaine certaines tel
telle tels telles
à a dans par pour sur sous avec sans entre vers chez contre depuis pendant avant après selon parmi
envers malgré durant hors outre via jusqu' jusque près auprès lors afin
et ou mais donc or ni car si comme quand lorsque lorsqu' puisque puisqu' quoique tandis ainsi alors
aussi bien encore enfin cependant pourtant néanmoins toutefois soit
suis es est sommes êtes sont étais était étions étiez étaient été être serai seras sera serons
serez seront serais serait serions seriez seraient sois soyons soyez soient fus fut furent ai as
avons avez ont avais avait avions aviez avaient eu avoir aurai auras aura aurons aurez auront
aurais aurait aurions auriez auraient aie aies ait ayons ayez aient eut eurent peut peuvent
pouvait pourrait pourraient doit doivent devait devrait devraient fait font
ne n' pas plus moins très trop peu beaucoup tant non oui déjà toujours jamais souvent ici là
comment pourquoi combien ensuite puis surtout notamment environ également ailleurs etc
c'est n'est qu'il qu'elle qu'ils qu'elles qu'on qu'un qu'une d'un d'une l'un l'une s'il s'ils
j'ai n'a n'ont c'était
deux trois quatre cinq six sept huit neuf dix premier première premiers premières second seconde
`);

export const STOPWORDS_ES = words(`
el la los las lo un una unos unas al del
de a ante bajo con contra desde durante en entre hacia hasta mediante para por según sin sobre tras
y e o u ni pero sino que porque como cuando donde mientras aunque si pues ya también tampoco
no sí muy más menos tan tanto tanta tantos tantas poco poca pocos pocas mucho mucha muchos muchas
bastante demasiado todo toda todos todas otro otra otros otras mismo misma mismos mismas cada
algún alguno alguna algunos algunas ningún ninguno ninguna varios varias cierto cierta ciertos
ciertas este esta estos estas ese esa esos esas aquel aquella aquellos aquellas esto eso aquello
mi mis tu tus su sus nuestro nuestra nuestros nuestras vuestro vuestra vuestros vuestras yo tú él
ella ello nosotros nosotras vosotros vosotras ellos ellas usted ustedes me te se nos os le les mí
ti conmigo contigo consigo quien quienes cual cuales cuyo cuya cuyos cuyas qué quién quiénes cuál
cuáles cómo dónde cuándo cuánto cuánta cuántos cuántas
soy eres es somos sois son era eras éramos erais eran fui fue fuimos fueron sea seas seamos sean
sería serían será serán ser sido siendo estoy estás está estamos estáis están estaba estaban
estuvo estuvieron esté estén estado estar estando he has ha hemos habéis han había habían hubo
haya hayan habría habrá haber habido hay puede pueden podría podrían
aquí allí ahí ahora antes después luego entonces siempre nunca además así aún todavía casi solo
sólo solamente incluso especialmente etc
uno dos tres cuatro cinco seis siete ocho nueve diez primer primero primera primeros primeras
segundo segunda
`);

export const STOPWORDS_IT = words(`
il lo la i gli le l' un uno una un' di a da in con su per tra fra del dello della dei degli delle
dell' al allo alla ai agli alle all' dal dallo dalla dai dagli dalle dall' nel nello nella nei
negli nelle nell' col coi sul sullo sulla sui sugli sulle sull' d'
e ed o od ma però anche né se che perché poiché quando come dove mentre sebbene benché quindi
dunque cioè oppure ovvero inoltre infatti tuttavia pure
io tu lui lei egli ella esso essa noi voi loro essi esse mi ti si ci vi ne me te se ce ve li mio
mia miei mie tuo tua tuoi tue suo sua suoi sue nostro nostra nostri nostre vostro vostra vostri
vostre questo questa questi queste quello quella quelli quelle quel quei quegli ciò chi cui quale
quali qualche alcuni alcune alcuno alcuna ogni ognuno ciascuno ciascuna tutto tutta tutti tutte
altro altra altri altre stesso stessa stessi stesse molto molta molti molte poco poca pochi poche
tanto tanta tanti tante troppo nessuno nessuna niente nulla
sono sei è siamo siete era erano ero fu furono sarà saranno sarebbe sarebbero sia siano fosse
fossero stato stata stati state essere ho hai ha abbiamo avete hanno aveva avevano ebbe avrà
avranno avrebbe abbia abbiano avuto avere può possono potrebbe potrebbero deve devono dovrebbe
dovrebbero
non più meno già ancora sempre mai spesso qui qua lì là così poi ora adesso prima dopo solo
soltanto circa quasi oltre sì no etc c'è
due tre quattro cinque sette otto nove dieci primo primi secondo seconda
`);

export const STOPWORDS_PT = words(`
o a os as um uma uns umas ao aos à às do da dos das dum duma no na nos nas num numa pelo pela pelos
pelas
de em por para com sem sob sobre entre até desde contra perante após ante segundo conforme durante
mediante
e ou mas porém todavia contudo que porque pois como quando onde enquanto embora se nem também já
ainda assim então logo portanto além
eu tu ele ela nós vós eles elas você vocês me te vos lhe lhes mim ti si comigo contigo consigo meu
minha meus minhas teu tua teus tuas seu sua seus suas nosso nossa nossos nossas vosso vossa vossos
vossas dele dela deles delas este esta estes estas esse essa esses essas aquele aquela aqueles
aquelas isto isso aquilo neste nesta nesse nessa naquele naquela deste desta desse dessa daquele
daquela quem qual quais cujo cuja cujos cujas todo toda todos todas outro outra outros outras
mesmo mesma mesmos mesmas cada algum alguma alguns algumas nenhum nenhuma vários várias certo
certa muito muita muitos muitas pouco pouca poucos poucas tanto tanta tal tais
sou és é somos são era eram fui foi fomos foram seja sejam seria seriam será serão ser sido sendo
estou está estamos estão estava estavam esteve estiveram esteja estejam estado estar estando
tenho tem temos têm tinha tinham teve tiveram tenha tenham terá terão teria ter tido havia há
houve haja haver pode podem poderia poderiam
não sim mais menos bem mal aqui ali lá agora antes depois sempre nunca só apenas inclusive cerca
quase etc
dois duas três quatro cinco seis sete oito nove dez primeiro primeira primeiros primeiras segunda
`);

export const STOPWORDS_NL = words(`
de het een der des den 't
ik jij je u hij zij ze wij we jullie hen hun mij me jou haar hem ons zich zichzelf mijn jouw zijn
onze uw dit dat deze die wie wat welk welke waar wanneer waarom hoe iemand niemand iets niets
alles allen alle elk elke ieder iedere ander andere anders sommige enkele veel weinig meer minder
meest beide zulk zulke zo'n
aan achter bij binnen boven buiten door in na naar naast om onder op over per rond sinds tegen
tot tussen uit van vanaf vanuit via volgens voor zonder met tijdens wegens ondanks dankzij omtrent
en of maar want dus omdat doordat zodat als dan toen terwijl hoewel indien mits tenzij noch zowel
evenals
ben bent is was waren geweest heb hebt heeft hebben had hadden gehad word wordt worden werd werden
geworden zal zult zullen zou zouden kan kunt kunnen kon konden moet moeten moest moesten mag mogen
mocht wil wilt willen wilde
niet geen wel ook nog al reeds zeer erg heel er hier daar daarom daarna daarbij daarvan daarin
daardoor daarmee hierbij hiervan hierin hiermee waarbij waarvan waarin waarmee nu altijd nooit
vaak soms ongeveer bijna alleen slechts echter toch juist zelfs vooral eens even ja nee etc bijv
één twee drie vier vijf zes zeven acht negen tien eerste tweede derde
`);

export const STOPWORDS_RU = words(`
я ты он она оно мы вы они меня тебя его её ее нас вас их мне тебе ему ей нам вам им мной мною тобой
тобою ним ней нами вами ними нём нем себя себе собой собою свой своя своё свое свои своего своей
своих своим своими своему мой моя моё мое мои моего моей моих наш наша наше наши нашего нашей
наших ваш ваша ваше ваши вашего вашей ваших этот эта это эти этого этой этих этому этим этими
этом том тот та те того той тех тому тем теми такой такая такое такие такого таких таким весь
вся всё все всего всей всех всем всеми сам сама само сами самого самой самих который которая
которое которые которого которой которых которому которым которыми котором кто что чего чему
чем ком чём каждый каждая каждое каждые некоторый некоторые некоторых другой другая другое
другие других иной иные любой
в во на с со к ко по за из изо от ото до у о об обо при про для без под подо над надо перед
передо через между среди около вокруг после ради вместо кроме мимо сквозь вдоль внутри вне
согласно благодаря
и а но да или либо ни чтобы чтоб как когда если хотя потому поэтому так также тоже зато однако
причем причём будто словно ибо пока лишь
быть был была было были будет будут буду будем будете будешь есть является являются
не же ли бы вот вон ведь уж уже ещё еще только даже почти очень более менее можно нельзя надо
нужно там тут здесь где куда откуда тогда потом теперь сейчас всегда никогда иногда часто
затем нет т.е. т.д. др
один одна одно одни два две три четыре пять шесть семь восемь девять десять первый первая
первое первые второй вторая второе
`);

// Lone generic qualifiers make poor labels in every language.
export const STOPLABELS_DE = [
  '^(?:neu|neue|neuer|neues|neuen|aktuell|aktuelle|aktuellen|verschiedene|verschiedenen|weitere|weiteren|' +
    'andere|anderen|wichtig|wichtige|wichtigen|allgemein|allgemeine|allgemeinen|groß|große|großen|klein|' +
    'kleine|kleinen|hoch|hohe|hohen|niedrig|niedrige|gut|gute|guten|möglich|mögliche|bestimmte|' +
    'bestimmten|spezielle|besondere|gesamte|ganze)$',
];
export const STOPLABELS_FR = [
  '^(?:nouveau|nouveaux|nouvelle|nouvelles|actuel|actuelle|actuels|actuelles|différent|différents|' +
    'différente|différentes|autre|autres|important|importante|importants|importantes|général|générale|' +
    'généraux|grand|grande|grands|grandes|petit|petite|petits|petites|haut|haute|bas|basse|bon|bonne|' +
    'possible|possibles|particulier|particulière|spécifique|spécifiques|total|totale)$',
];
export const STOPLABELS_ES = [
  '^(?:nuevo|nueva|nuevos|nuevas|actual|actuales|diferente|diferentes|distinto|distintos|importante|' +
    'importantes|general|generales|grande|grandes|gran|pequeño|pequeña|pequeños|pequeñas|alto|alta|' +
    'altos|altas|bajo|baja|bajos|bajas|bueno|buena|buenos|buenas|posible|posibles|específico|' +
    'específica|específicos|particular|total)$',
];
export const STOPLABELS_IT = [
  '^(?:nuovo|nuova|nuovi|nuove|attuale|attuali|diverso|diversa|diversi|diverse|importante|importanti|' +
    'generale|generali|grande|grandi|piccolo|piccola|piccoli|piccole|alto|alta|alti|alte|basso|bassa|' +
    'bassi|basse|buono|buona|buoni|buone|possibile|possibili|specifico|specifica|specifici|specifiche|' +
    'particolare|particolari|totale)$',
];
export const STOPLABELS_PT = [
  '^(?:novo|nova|novos|novas|atual|atuais|diferente|diferentes|importante|importantes|geral|gerais|' +
    'grande|grandes|pequeno|pequena|pequenos|pequenas|alto|alta|altos|altas|baixo|baixa|baixos|baixas|' +
    'bom|boa|bons|boas|possível|possíveis|específico|específica|específicos|particular|total)$',
];
export const STOPLABELS_NL = [
  '^(?:nieuw|nieuwe|huidig|huidige|verschillend|verschillende|ander|andere|belangrijk|belangrijke|' +
    'algemeen|algemene|groot|grote|klein|kleine|hoog|hoge|laag|lage|goed|goede|mogelijk|mogelijke|' +
    'specifiek|specifieke|bijzonder|bijzondere|totaal|totale)$',
];
export const STOPLABELS_RU = [
  '^(?:новый|новая|новое|новые|новых|современный|современные|различные|различных|разные|важный|' +
    'важные|общий|общая|общие|большой|большая|большие|малый|малые|высокий|высокая|высокие|низкий|' +
    'низкая|низкие|хороший|хорошая|возможный|возможные|особый|особые|конкретный)$',
];
