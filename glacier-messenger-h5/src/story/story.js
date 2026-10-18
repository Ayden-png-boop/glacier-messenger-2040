/**
 * 剧情数据 —— 严格依据《冰川信使：斑头雁的2040创作方案》。
 *
 * 结构对标参考站引擎：
 *   chapter { id, video, title, description, choices[] }
 *   choice  { id, text, description, effects, condition?, animation,
 *             consequences, nextState?, nextChapter?, ending? | endingRule?, qte? }
 *
 * 四语字段统一为 { zh, en, ja, fr }。
 * 视频资源全部取自用户提供的 Scenes 素材包（27 个片段，全部被引用，无外部网络视频）。
 */

export const INITIAL_STATS = { cooperation: 50, radical: 0, health: 100 }

export const INITIAL_CHAPTER = 1

export const INITIAL_STATE = {
  discoveredMining: false, // 第一章选①，拍到采矿机照片（证据链 1）
  heatCorridor: false, // 第一章选②，热浪走廊形成（后续能量惩罚）
  satelliteTracker: false, // 选项2②，丽莎博士的卫星追踪器
  animalProtest: false, // 选项2①，动物界抗议
  mediaSupport: false, // 选项3②，全球舆论支持
  miningSabotaged: false, // 选项3①，夜袭成功
  hasMonitorDevice: false, // 选项4①，监测仪已安装
  iceCoreData: false, // 选项4①，冰芯污染数据（证据链 2）
  exposedLies: false, // 选项5①，揭露能源公司
  internalSplit: false, // 选项5②，族群内部分裂
  climateEmergency: false, // 选项8①，全球气候紧急状态
  condenserTech: false, // 选项8②，大气冷凝器科技树
  sacrificed: false, // 选项9①，牺牲迁徙路线
  newHabitat: false, // 选项9②，寻找新栖息地
}

export const ENDINGS = {
  hope: {
    video: 'ending_hope',
    title: {
      zh: '黎明',
      en: 'Dawn of Hope',
      ja: '夜明け',
      fr: "L'Aube de l'Espoir",
    },
    description: {
      zh: '在全球协作之下，冰川开始重新冻结。小雁在新生冰川上跳跃，冰面反射出久违的蓝。\n\n雪翼落在最高的一处冰脊上，看着雁群从南方归来。它们还记得那条古老的航线 —— 而这一次，航线之下仍有冰。',
      en: 'Under global cooperation, the glaciers begin to refreeze. Young geese leap across the newborn ice, and the surface throws back a long-lost blue.\n\nXueyi lands on the highest ridge and watches the flock return from the south. They still remember the ancient route — and this time, there is still ice beneath it.',
      ja: '世界の協力のもと、氷河はふたたび凍りはじめた。若い雁たちが生まれたばかりの氷の上を跳ね、その表面は久しく忘れられていた青を映し返す。\n\nシュエイーは最も高い氷の稜線に降り立ち、南から戻ってくる群れを見つめる。彼らはあの古い航路を覚えている —— そして今度は、その航路の下にまだ氷がある。',
      fr: "Grâce à la coopération mondiale, les glaciers commencent à regeler. Les jeunes oies bondissent sur la glace nouveau-née, dont la surface renvoie un bleu longtemps perdu.\n\nXueyi se pose sur la plus haute crête et regarde le vol revenir du sud. Ils se souviennent encore de l'antique route — et cette fois, il y a toujours de la glace en dessous.",
    },
  },
  adaptation: {
    video: 'ending_adaptation',
    title: {
      zh: '他乡',
      en: 'Adaptation and Survival',
      ja: '適応と生存',
      fr: 'Adaptation et Survie',
    },
    description: {
      zh: '失去了故乡，雁群却在新的大地上顽强地活了下来。它们把古老的迁徙记忆一代代传下去 —— 也许某一代，会重新见到雪。',
      en: 'Though they lost their homeland, the flock endured on new ground, passing the memory of the ancient migration from generation to generation. Perhaps one generation will see the snow again.',
      ja: '故郷を失いながらも、雁たちは新しい大地でたくましく生き抜き、古の渡りの記憶を次代へと受け継いでいく。いつの日か、雪に出会う世代が来るかもしれない。',
      fr: "Ayant perdu leur patrie, le vol a survécu avec ténacité sur de nouvelles terres, transmettant de génération en génération la mémoire de l'antique migration. Peut-être qu'une génération reverra la neige.",
    },
  },
  doom: {
    video: 'ending_doom',
    title: {
      zh: '沉默的天空',
      en: 'Silent Sky',
      ja: '沈黙の空',
      fr: 'Ciel Silencieux',
    },
    description: {
      zh: '冰川消失了，海平面上升，天空中再也没有映出雁群的影子。',
      en: 'The glaciers are gone, the seas have risen, and no shadow of a goose crosses the sky again.',
      ja: '氷河は消え、海面は上昇し、空にはもう雁の影が映ることはなかった……',
      fr: "Les glaciers ont disparu, le niveau de la mer a monté, et plus aucune ombre de vol ne traversa le ciel…",
    },
  },
}

export const CHAPTERS = [
  /* ───────────────────────── 第一章 ───────────────────────── */
  {
    id: 1,
    video: 'ch01_glacier_crack',
    title: { zh: '珠峰警报', en: 'Everest Alarm', ja: 'エベレストの警鐘', fr: "Alerte à l'Everest" },
    description: {
      zh: '镜头以 45 度角俯拍珠峰北坡。晨光照在冰棱上折射出冷冽的蓝，忽然，一声如雷的冰裂声撕裂寂静 —— 冰川表面瞬间迸开蛛网状的裂痕，融水像溃脓的伤口般喷涌而出。\n\n冰裂缝中升腾着诡异的白色雾气，飘落的冰晶在阳光下形成微型彩虹。远处传来冰川坍塌的闷响回声。\n\n雪翼（翎羽剧烈震颤，瞳孔收缩）："这条裂缝……去年还不存在……（突然警觉地昂首）是那些钢铁秃鹫的味道！"',
      en: 'The camera tilts down on the north face of Everest at 45 degrees. Dawn light breaks into cold blue along the ice ridges — then a crack like thunder tears the silence apart. A web of fissures bursts across the glacier and meltwater erupts like pus from a wound.\n\nStrange white vapour rises from the crevasses; falling ice crystals scatter tiny rainbows. Far off, the muffled echo of collapsing ice.\n\nXueyi (plumage shivering violently, pupils contracting): "This fissure… it wasn\'t here last year… (suddenly alert, head raised) I know that smell — steel vultures!"',
      ja: 'カメラは45度の角度からエベレスト北面を俯瞰する。朝の光が氷の稜線で冷たい青に砕ける。と、雷鳴のような亀裂音が静寂を引き裂いた —— 氷河の表面に蜘蛛の巣状の裂け目が走り、融水が膿の傷口のように噴き出す。\n\nクレバスからは不気味な白い霧が立ちのぼり、舞い落ちる氷晶が陽射しのなかで小さな虹をつくる。遠くから氷河崩落の鈍い響きが返ってくる。\n\nシュエイー（羽を激しく震わせ、瞳孔が縮む）：「この亀裂……去年はなかった……（はっと顔を上げて）あの鉄のハゲタカの匂いだ！」',
      fr: "La caméra plonge à 45 degrés sur la face nord de l'Everest. La lumière de l'aube se brise en bleu glacial sur les arêtes — puis un craquement de tonnerre déchire le silence. Une toile de fissures éclate sur le glacier et l'eau de fonte jaillit comme d'une plaie purulente.\n\nUne vapeur blanche étrange monte des crevasses ; les cristaux de glace qui tombent dessinent de minuscules arcs-en-ciel. Au loin, l'écho sourd d'un effondrement.\n\nXueyi (plumage frémissant, pupilles contractées) : « Cette fissure… elle n'existait pas l'an dernier… (soudain en alerte) Je reconnais cette odeur — les vautours d'acier ! »",
    },
    choices: [
      {
        id: 'c1a',
        text: { zh: '俯冲调查！', en: 'Dive and investigate!', ja: '急降下して調査せよ！', fr: 'Plonger et enquêter !' },
        description: {
          zh: '雪翼猛然收拢羽翼，像一柄银色匕首刺入裂缝。湍流中，冰晶在羽毛上凝结成危险的铠甲。裂缝底部闪烁着诡异的蓝光 —— 三台巨型金刚石采矿机正在作业，液压钻头喷出黑色油雾。',
          en: 'Xueyi snaps her wings shut and drops into the fissure like a silver dagger. In the turbulence, ice crystals freeze into a dangerous armour on her feathers. At the bottom, an eerie blue glow — three giant diamond mining rigs at work, hydraulic drills spitting black oil mist.',
          ja: 'シュエイーは翼を畳み、銀の短刀のように亀裂へ飛び込む。乱流のなか、氷晶が羽に危険な鎧となって凝りつく。亀裂の底では不気味な青い光 —— 三台の巨大なダイヤモンド採掘機が稼働し、油圧ドリルが黒い油霧を吹き出している。',
          fr: "Xueyi referme ses ailes et plonge dans la fissure comme une dague d'argent. Dans la turbulence, les cristaux de glace gèlent en une armure dangereuse sur ses plumes. Au fond, une lueur bleue sinistre : trois foreuses diamantées géantes en action, crachant un brouillard d'huile noire.",
        },
        effects: { radical: 5, health: -20 },
        animation: 'ch01_mining_robots',
        consequences: {
          zh: '体力储备下降：风暴场景逃生成功率 −20%。已拍到采矿机照片，解锁「冰川下的谎言」证据链。',
          en: 'Stamina reserve drops: escape odds in storm scenes −20%. Mining rig photos secured — the "Lies Beneath the Glacier" evidence chain is unlocked.',
          ja: '体力の余力が低下：嵐の場面での脱出成功率 −20%。採掘機の写真を撮影し、「氷河の下の嘘」の証拠チェーンを解放。',
          fr: "Réserve d'endurance en baisse : chances d'échapper aux scènes de tempête −20 %. Photos des foreuses obtenues — la chaîne de preuves « Le mensonge sous le glacier » est débloquée.",
        },
        nextState: { discoveredMining: true },
        nextChapter: 2,
      },
      {
        id: 'c1b',
        text: { zh: '强行突破！', en: 'Break through!', ja: '強行突破！', fr: 'Forcer le passage !' },
        description: {
          zh: '雁群紧急变换为箭矢阵型，却突然被粉红色的湿热气团吞没。能见度瞬间降至 3 米。',
          en: 'The flock snaps into arrow formation — then is swallowed by a rose-coloured mass of humid heat. Visibility drops to three metres in an instant.',
          ja: '群れは緊急に矢じりの陣形へ変わるが、突如ピンク色の湿った熱気の塊に飲み込まれる。視界は瞬時に3メートルまで落ちる。',
          fr: "Le vol se reforme en flèche — puis est englouti par une masse rose de chaleur humide. La visibilité tombe instantanément à trois mètres.",
        },
        effects: { health: -10, radical: 5 },
        animation: 'ch01_excavator',
        consequences: {
          zh: '热浪走廊已经形成：未来迁徙将多消耗 18% 能量储备。',
          en: 'A heat corridor has formed: future migrations will cost 18 % more energy.',
          ja: '熱波の回廊が形成された：今後の渡りはエネルギーを18%多く消費する。',
          fr: "Un corridor de chaleur s'est formé : les futures migrations coûteront 18 % d'énergie en plus.",
        },
        nextState: { heatCorridor: true },
        nextChapter: 2,
      },
    ],
  },

  /* ───────────────────────── 第二章 ───────────────────────── */
  {
    id: 2,
    video: 'ch02_council_a',
    title: { zh: '动物议会', en: 'Animal Council', ja: '動物たちの評議会', fr: 'Le Conseil des Animaux' },
    description: {
      zh: '破碎的经幡在寒风中猎猎作响，月光透过残垣断壁，在废墟上投下斑驳的阴影。\n\n冰芯样本被赤瞳的爪子深深插入经幡柱，瞬间投射出一幅全息影像 —— 1980 年的冰川如银甲覆盖山脊，而 2023 年的影像却已千疮百孔。\n\n雪豹冰刃的尾巴焦躁地拍打着地面；牦牛震地的青铜鼻环在月光下泛着冷光，上面刻着的藏文"人兽和平"显得格外讽刺。\n\n赤瞳（尾巴一甩，全息数据闪烁）："40 年，25% 的冰川消失了！再这样下去，我们的后代连雪都看不到了！"（它用尾巴划出一条红色预测线：2070 年冰川将完全消失）',
      en: 'Torn prayer flags crack in the cold wind; moonlight sifts through broken walls and lays mottled shadows across the ruins.\n\nChitong drives an ice-core sample into a flagpole and a hologram blooms — the glaciers of 1980 sheathing the ridge in silver armour, beside them the riddled wreck of 2023.\n\nIceblade the snow leopard flicks its tail against the ground in irritation; the bronze nose-ring of Zhendi the yak glints cold in the moonlight, its Tibetan inscription — "Peace between beast and man" — unbearably ironic.\n\nChitong (tail snapping, hologram flickering): "Forty years, and 25 % of the glaciers are gone! At this rate our children will never see snow." (Its tail draws a red projection line: by 2070 the glaciers will vanish entirely.)',
      ja: '破れた経幡が寒風に鳴り、月光が崩れた壁の隙間から差し込んで、廃墟にまだらな影を落とす。\n\n氷床サンプルがチートンの爪によって経幡の柱に深く突き立てられ、たちまちホログラムが浮かび上がる —— 1980年の氷河は銀の鎧のように稜線を覆い、2023年の映像はすでに穴だらけだ。\n\nユキヒョウのビンレンは苛立たしげに尾で地面を叩く。ヤクのジェンディの青銅の鼻輪が月光に冷たく光り、そこに刻まれたチベット語「人と獣の平和」がひどく皮肉に見える。\n\nチートン（尾を一振りし、ホログラムが明滅する）：「40年で氷河の25%が消えた！このままでは、我らの子孫は雪さえ見られなくなる！」（尾で赤い予測線を引く：2070年、氷河は完全に消える）',
      fr: "Des drapeaux de prière déchirés claquent dans le vent froid ; la lune filtre à travers les murs brisés et pose des ombres tachetées sur les ruines.\n\nChitong enfonce un échantillon de carotte glaciaire dans un mât et un hologramme s'épanouit : les glaciers de 1980 habillant la crête d'une armure d'argent, face à l'épave criblée de 2023.\n\nIceblade le léopard des neiges fouette le sol de sa queue, agacé ; l'anneau nasal de bronze du yak Zhendi luit froidement au clair de lune, et son inscription tibétaine — « Paix entre la bête et l'homme » — sonne atrocement ironique.\n\nChitong (queue claquante, hologramme vacillant) : « Quarante ans, et 25 % des glaciers ont disparu ! À ce rythme, nos enfants ne verront jamais la neige. » (Sa queue trace une ligne rouge : en 2070, les glaciers auront totalement disparu.)",
    },
    choices: [
      {
        id: 'c2a',
        text: { zh: '发动动物界抗议！', en: 'Launch an animal protest!', ja: '動物界の抗議を起こせ！', fr: 'Lancer une protestation animale !' },
        description: {
          zh: '指挥信天翁群堵塞机场，松鼠切断输电线。',
          en: 'Albatross squadrons block the airports; squirrels cut the power lines.',
          ja: 'アホウドリの群れに空港を塞がせ、リスに送電線を切断させる。',
          fr: "Des escadrons d'albatros bloquent les aéroports ; les écureuils coupent les lignes électriques.",
        },
        effects: { radical: 30, cooperation: -5 },
        animation: 'choice_animal_protest',
        consequences: {
          zh: '激进值大幅上升，解锁暴力路线。隐藏风险：可能触发人类报复性捕杀。',
          en: 'Radicality surges — the militant path opens. Hidden risk: reprisal culls by humans.',
          ja: '過激値が大きく上昇し、実力行使の路線を解放。潜在リスク：人間による報復的な駆除。',
          fr: "La radicalité bondit — la voie militante s'ouvre. Risque caché : des abattages de représailles.",
        },
        nextState: { animalProtest: true },
        nextChapter: 3,
      },
      {
        id: 'c2b',
        text: { zh: '先联系人类科学家', en: 'Contact the human scientists first', ja: 'まず人間の科学者に連絡する', fr: "Contacter d'abord les scientifiques" },
        description: {
          zh: '把冰芯样本的坐标与数据，通过候鸟的旧航线传递给丽莎博士。',
          en: 'Pass the ice-core coordinates and data to Dr. Lisa along the old migratory routes.',
          ja: '氷床サンプルの座標とデータを、渡り鳥の古い航路を通じてリサ博士に届ける。',
          fr: "Transmettre les coordonnées et les données de la carotte à la Dr Lisa par les anciennes routes migratoires.",
        },
        effects: { cooperation: 20 },
        animation: 'choice_contact_scientist',
        consequences: {
          zh: '获得丽莎博士的卫星追踪器，可显示实时冰川融化热点；后续监测仪安装成功率提升。',
          en: "You receive Dr. Lisa's satellite tracker, showing live melt hotspots; later monitor deployments become more likely to succeed.",
          ja: 'リサ博士の衛星トラッカーを入手し、リアルタイムの氷河融解ホットスポットを表示できる。以降の観測装置の設置成功率が上がる。',
          fr: "Vous recevez le traceur satellite de la Dr Lisa, affichant les points chauds de fonte en direct ; les installations de capteurs réussiront plus souvent.",
        },
        nextState: { satelliteTracker: true },
        nextChapter: 3,
      },
    ],
  },

  /* ───────────────────────── 第三章 ───────────────────────── */
  {
    id: 3,
    video: 'ch02_council_b',
    title: { zh: '分裂的议会', en: 'The Divided Council', ja: '分裂した評議会', fr: 'Le Conseil Divisé' },
    description: {
      zh: '冰刃（露出獠牙）："那些矿工昨晚又炸掉了东侧冰舌！"\n\n议会厅里一片死寂。赤瞳的全息投影仍在缓缓旋转，2070 年那条红色预测线像一道灼伤的疤。震地的青铜鼻环撞在地面上，发出沉闷的一声。\n\n和平的呼声与复仇的嘶吼在废墟间来回碰撞 —— 而雁群只需要一个方向。',
      en: 'Iceblade (fangs bared): "Those miners blew up the eastern ice tongue again last night!"\n\nDead silence in the council hall. Chitong\'s hologram still turns slowly, the red 2070 line like a burn scar. Zhendi\'s bronze ring strikes the ground with a dull note.\n\nCalls for peace and howls for revenge collide among the ruins — and the flock needs only one direction.',
      ja: 'ビンレン（牙をむいて）：「あの坑夫たちが昨夜また東側の氷舌を爆破した！」\n\n評議場はしんと静まり返る。チートンのホログラムはなおゆっくりと回り、2070年の赤い予測線はやけどの痕のようだ。ジェンディの青銅の鼻輪が地面に当たり、鈍い音を立てる。\n\n平和を求める声と復讐の咆哮が廃墟のあいだでぶつかり合う —— 群れに必要なのは、ただ一つの方向だ。',
      fr: "Iceblade (crocs découverts) : « Ces mineurs ont encore fait sauter la langue glaciaire est la nuit dernière ! »\n\nSilence de mort dans la salle du conseil. L'hologramme de Chitong tourne toujours lentement, la ligne rouge de 2070 comme une cicatrice de brûlure. L'anneau de bronze de Zhendi frappe le sol d'une note sourde.\n\nLes appels à la paix et les hurlements de vengeance se heurtent parmi les ruines — et le vol n'a besoin que d'une direction.",
    },
    choices: [
      {
        id: 'c3a',
        text: { zh: '支持夜袭采矿站', en: 'Support the night raid', ja: '夜襲を支持する', fr: 'Soutenir le raid nocturne' },
        description: {
          zh: 'QTE：在 30 秒内完成突袭，关闭矿井阀门。',
          en: 'QTE: complete the raid within 30 seconds and shut the mine valves.',
          ja: 'QTE：30秒以内に襲撃を完了し、鉱山のバルブを閉じろ。',
          fr: 'QTE : terminer le raid en 30 secondes et fermer les vannes de la mine.',
        },
        effects: { radical: 20, cooperation: -10 },
        qte: { targets: 8, seconds: 30 },
        animation: 'ch03_night_a',
        consequences: {
          zh: '成功：关闭 2 座矿井，降低冰崩概率。失败：巡逻犬咬伤雁群，族群数量 −10%。',
          en: 'Success: two mines shut down, avalanche risk reduced. Failure: patrol dogs maul the flock, population −10 %.',
          ja: '成功：2つの鉱山を停止し、氷雪崩の確率を下げる。失敗：番犬に群れが襲われ、個体数 −10%。',
          fr: "Succès : deux mines fermées, risque d'avalanche réduit. Échec : les chiens de garde mutilent le vol, population −10 %.",
        },
        nextState: { miningSabotaged: true },
        nextChapter: 4,
      },
      {
        id: 'c3b',
        text: { zh: '组织和平示威', en: 'Organise a peaceful protest', ja: '平和的なデモを組織する', fr: 'Organiser une manifestation pacifique' },
        description: {
          zh: '雪翼用反光羽毛拼出巨大的 "SOS"，吸引无人机拍摄。',
          en: 'Xueyi arranges her mirror-bright feathers into a giant "SOS" to draw the drones.',
          ja: 'シュエイーは光を反射する羽で巨大な「SOS」を描き、ドローンを引き寄せる。',
          fr: "Xueyi dispose ses plumes réfléchissantes en un « SOS » géant pour attirer les drones.",
        },
        effects: { cooperation: 15, radical: 5 },
        animation: 'ch06_media_tv',
        consequences: {
          zh: '全球新闻弹窗：《动物集体抗议气候变化》登上热搜第一 —— 后续人类选项的妥协概率 +15%。',
          en: 'Breaking news worldwide: "Animals Protest Climate Change en Masse" hits number one — later human choices are 15 % more likely to concede.',
          ja: '全世界にニュース速報：「動物たちが気候変動に集団抗議」がトレンド1位に —— 以降の人間側の選択で譲歩する確率 +15%。',
          fr: "Flash mondial : « Les animaux protestent en masse contre le climat » atteint la première place — les choix humains ultérieurs céderont 15 % plus souvent.",
        },
        nextState: { mediaSupport: true },
        nextChapter: 4,
      },
    ],
  },

  /* ───────────────────────── 第四章 ───────────────────────── */
  {
    id: 4,
    video: 'ch04_lab',
    title: { zh: '科学家的请求', en: "The Scientist's Request", ja: '科学者の願い', fr: 'La Requête de la Scientifique' },
    description: {
      zh: '镜头从高空俯冲。雪翼的雁群在迪拜的摩天楼群间穿梭，玻璃幕墙反射的烈日强光形成致命的光污染带。\n\n雪翼的视角：画面短暂过曝，边缘泛起刺眼的白芒 —— HUD 显示「视觉灵敏度 −40%」。\n\n远处，人工滑雪场的造雪机轰鸣运转，与沙漠气候形成荒诞对比。玻璃幕墙上滚动播放着能源公司的广告："清洁能源，守护冰川！"（讽刺的是，画面角落飘过一缕黑烟）\n\n丽莎博士（举起监测仪）："阿尔卑斯冰川将在 2100 年消失 92%……帮我们安装这个！"',
      en: 'The camera dives from altitude. Xueyi\'s flock threads between the skyscrapers of Dubai, where the mirrored glass throws back a lethal band of glare.\n\nHer point of view: the frame blows out for a moment, a blinding white burn at the edges — the HUD reads "visual acuity −40 %".\n\nBeyond, snow cannons roar over an indoor ski slope, absurd against the desert. On the glass wall an energy company ad loops: "Clean energy, protecting the glaciers!" — while a thread of black smoke drifts past the corner of the frame.\n\nDr. Lisa (raising a sensor): "The Alps will lose 92 % of their glaciers by 2100… help us install this!"',
      ja: 'カメラが高空から急降下する。シュエイーの群れはドバイの摩天楼の間を縫って飛び、ガラス壁が反射する烈日の強光が致命的な光害の帯をつくる。\n\nシュエイーの視界：画面が一瞬白飛びし、縁にまぶしい白がにじむ —— HUD は「視覚感度 −40%」と表示する。\n\n遠くでは人工スキー場の造雪機が轟音を立てて回り、砂漠の気候と滑稽な対比をなす。ガラス壁にはエネルギー企業の広告が流れ続ける：「クリーンエネルギーで氷河を守る！」（皮肉なことに、画面の隅を一筋の黒い煙が流れていく）\n\nリサ博士（観測装置を掲げて）：「アルプスの氷河は2100年までに92%が消える……これを設置するのを手伝って！」',
      fr: "La caméra plonge depuis l'altitude. Le vol de Xueyi se faufile entre les gratte-ciel de Dubaï, où les vitres en miroir renvoient une bande d'éblouissement mortelle.\n\nSon point de vue : l'image sature un instant, une brûlure blanche aveuglante aux bords — le HUD affiche « acuité visuelle −40 % ».\n\nPlus loin, des canons à neige hurlent sur une piste couverte, absurdes dans le désert. Sur la paroi de verre, une pub en boucle : « Énergie propre, protégeons les glaciers ! » — tandis qu'un filet de fumée noire dérive au coin du cadre.\n\nDr Lisa (levant un capteur) : « Les Alpes auront perdu 92 % de leurs glaciers en 2100… aidez-nous à installer ceci ! »",
    },
    choices: [
      {
        id: 'c4a',
        text: { zh: '协助安装', en: 'Help install it', ja: '設置に協力する', fr: "Aider à l'installer" },
        description: {
          zh: '跟随丽莎博士登上阿尔卑斯观测站，部署冰川监测仪，并取回冰芯污染数据。',
          en: 'Follow Dr. Lisa up to the Alpine station, deploy the glacier monitor and retrieve the ice-core contamination data.',
          ja: 'リサ博士とアルプスの観測所に登り、氷河観測装置を設置し、氷床の汚染データを持ち帰る。',
          fr: "Suivre la Dr Lisa jusqu'à la station alpine, déployer le capteur glaciaire et rapporter les données de contamination de la carotte.",
        },
        effects: { cooperation: 25, health: -10 },
        animation: 'flock_a',
        consequences: {
          zh: '解锁「冰川健康度」实时仪表盘；人工降雪精度提升 25%。获得冰芯污染数据 —— 这是日后指控能源公司的关键证据。',
          en: 'The live "Glacier Health" dashboard is unlocked; snow-seeding accuracy +25 %. Ice-core contamination data secured — key evidence against the energy company.',
          ja: '「氷河健康度」リアルタイム計器盤を解放。人工降雪の精度 +25%。氷床汚染データを入手 —— のちにエネルギー企業を告発する決め手となる。',
          fr: "Le tableau de bord « Santé des Glaciers » est débloqué ; précision de l'ensemencement neigeux +25 %. Données de contamination obtenues — preuve clé contre l'entreprise énergétique.",
        },
        nextState: { hasMonitorDevice: true, iceCoreData: true },
        nextChapter: 5,
      },
      {
        id: 'c4b',
        text: { zh: '拒绝并觅食', en: 'Refuse and forage', ja: '断って餌を探す', fr: 'Refuser et chercher à manger' },
        description: {
          zh: '雁群降落在城市边缘的垃圾场，吞食塑料包装里残留的残渣。',
          en: 'The flock drops onto a landfill at the edge of the city and pecks at scraps left in plastic packaging.',
          ja: '群れは都市の外れのゴミ捨て場に降り立ち、プラスチック包装に残った食べかすをついばむ。',
          fr: "Le vol se pose sur une décharge en bord de ville et picore les restes laissés dans les emballages plastiques.",
        },
        effects: { health: 20, cooperation: -15 },
        animation: 'flock_b',
        consequences: {
          zh: '体力 +20%，但错过了某国篡改气候数据的关键证据。',
          en: 'Stamina +20 %, but you miss the key evidence of a nation doctoring climate data.',
          ja: '体力 +20%。だが、某国が気候データを改ざんした決定的証拠を逃す。',
          fr: "Endurance +20 %, mais vous manquez la preuve qu'une nation falsifie les données climatiques.",
        },
        nextChapter: 5,
      },
    ],
  },

  /* ───────────────────────── 第五章 ───────────────────────── */
  {
    id: 5,
    video: 'closeup_eye',
    title: { zh: '能源公司的陷阱', en: 'The Energy Company Trap', ja: 'エネルギー企業の罠', fr: "Le Piège de l'Entreprise Énergétique" },
    description: {
      zh: 'CEO 微笑着递出一把面包屑："我们的『清洁煤炭』能让融化减速。"\n\n全息弹窗自行弹出核查结果 —— ⚠️ 该公司年排放量 = 1.2 万座珠峰冰川的融化量。\n\n雪翼盯着那把面包屑。远处冰舌的崩裂声还在继续，而玻璃幕墙上，"守护冰川"四个字正一圈圈滚动。',
      en: 'The CEO smiles and holds out a handful of breadcrumbs: "Our \'clean coal\' can slow the melting."\n\nA holographic window pops up with the audit result on its own — ⚠️ the company\'s annual emissions equal the melt of 12,000 Everest glaciers.\n\nXueyi stares at the breadcrumbs. Far off, the ice tongue keeps cracking; on the glass wall, the words "protecting the glaciers" scroll round and round.',
      ja: 'CEOは微笑みながらパンくずを差し出す：「我々の『クリーンコール』が融解を遅らせる。」\n\nホログラムの窓がひとりでに開き、検証結果を示す —— ⚠️ 同社の年間排出量は、エベレスト氷河1万2000個分の融解に相当する。\n\nシュエイーはそのパンくずを見つめる。遠くでは氷舌の亀裂音が続き、ガラス壁には「氷河を守る」の四文字がぐるぐると流れていく。',
      fr: "Le PDG sourit et tend une poignée de miettes : « Notre \"charbon propre\" peut ralentir la fonte. »\n\nUne fenêtre holographique s'ouvre d'elle-même avec le résultat de l'audit — ⚠️ les émissions annuelles de la société équivalent à la fonte de 12 000 glaciers de l'Everest.\n\nXueyi fixe les miettes. Au loin, la langue glaciaire continue de craquer ; sur la paroi de verre, les mots « protéger les glaciers » défilent en boucle.",
    },
    choices: [
      {
        id: 'c5a',
        text: { zh: '揭露谎言', en: 'Expose the lie', ja: '嘘を暴く', fr: 'Dévoiler le mensonge' },
        description: {
          zh: '把证据链交给国际媒体：采矿照片、冰芯污染数据、内部邮件。',
          en: 'Hand the full evidence chain to the international press: mining photos, ice-core contamination data, internal emails.',
          ja: '証拠チェーンを国際メディアに渡す：採掘現場の写真、氷床汚染データ、内部メール。',
          fr: "Confier toute la chaîne de preuves à la presse internationale : photos des mines, données de contamination, e-mails internes.",
        },
        condition: (state) => state.discoveredMining && state.iceCoreData,
        conditionHint: {
          zh: '需要证据链：采矿照片（第一章）+ 冰芯污染数据（第四章）',
          en: 'Requires the evidence chain: mining photos (Ch. 1) + ice-core contamination data (Ch. 4)',
          ja: '証拠チェーンが必要：採掘現場の写真（第一章）＋氷床汚染データ（第四章）',
          fr: "Nécessite la chaîne de preuves : photos des mines (ch. 1) + données de contamination (ch. 4)",
        },
        effects: { cooperation: 30, radical: 10 },
        animation: 'choice_expose_lies',
        consequences: {
          zh: '股价崩盘新闻直播。该公司被迫停摆，多国启动独立调查。',
          en: 'Live coverage of a collapsing share price. The company is forced to halt, and several nations open independent inquiries.',
          ja: '株価暴落の生中継。同社は操業停止に追い込まれ、複数の国が独自調査に着手する。',
          fr: "Diffusion en direct de l'effondrement de l'action. La société doit s'arrêter et plusieurs nations ouvrent des enquêtes indépendantes.",
        },
        nextState: { exposedLies: true, mediaExposed: true },
        nextChapter: 6,
      },
      {
        id: 'c5b',
        text: { zh: '假装合作', en: 'Feign cooperation', ja: '協力するふりをする', fr: 'Feindre la coopération' },
        description: {
          zh: '收下"防风巢穴"的材料，暂时不撕破脸。',
          en: 'Accept the "windproof nest" materials and keep the peace for now.',
          ja: '「防風の巣」の材料を受け取り、今はまだ顔を潰さない。',
          fr: "Accepter les matériaux du « nid coupe-vent » et ne pas rompre pour l'instant.",
        },
        effects: { cooperation: -30 },
        animation: 'ch03_night_b',
        consequences: {
          zh: '短期获得防风巢穴材料；长期代价：族群出现内部分裂，信任度 −30%。',
          en: 'Short-term gain: windproof nest materials. Long-term cost: the flock splinters, trust −30 %.',
          ja: '短期的には防風の巣の材料を得る。長期的な代償：群れに内部分裂が生じ、信頼度 −30%。',
          fr: "Gain à court terme : matériaux du nid coupe-vent. Coût à long terme : le vol se divise, confiance −30 %.",
        },
        nextState: { internalSplit: true },
        nextChapter: 6,
      },
    ],
  },

  /* ───────────────────────── 第六章 ───────────────────────── */
  {
    id: 6,
    video: 'transition_timelapse',
    title: { zh: '技术伦理困境', en: 'The Ethics of Technology', ja: '技術倫理のジレンマ', fr: 'Le Dilemme Éthique' },
    description: {
      zh: '雪翼的雁群掠过阿尔卑斯山脉时，看到的已不再是记忆中的那片冰原。\n\n巨大的冰舌正在断裂。万年凝结的蓝冰在高温下发出不堪重负的呻吟，裂缝像蛛网般在冰面上蔓延。随着一声震耳欲聋的爆裂声，半座冰崖轰然崩塌，坠入下方浑浊的融水湖中，激起十米高的黑色浪涛。\n\n就在崩塌的冰崖下方，某国正在秘密试验：向冰川喷洒硫酸钙颗粒，制造人工降雪。',
      en: 'When Xueyi\'s flock sweeps over the Alps, it is no longer the ice field they remember.\n\nThe great ice tongue is breaking. Blue ice condensed over ten thousand years groans under the heat, and crevasses spread like a web across the surface. With a deafening crack half a cliff collapses into the turbid meltwater lake below, throwing up a ten-metre black wave.\n\nBeneath the falling cliff, a nation is running a secret trial: spraying calcium sulphate particles onto the glacier to seed artificial snow.',
      ja: 'シュエイーの群れがアルプス山脈をかすめたとき、そこにはもはや記憶のあの氷原はなかった。\n\n巨大な氷舌が割れつつある。万年の歳月をかけて凝った青い氷が、高温のなかで耐えがたい軋みをあげ、亀裂が蜘蛛の巣のように氷面を走る。耳をつんざく爆裂音とともに半ばの氷崖が崩れ落ち、下の濁った融水湖へと落ちて、10メートルの黒い波を巻き上げる。\n\n崩れた氷崖のすぐ下で、某国が秘密裡に実験を行っている：氷河に硫酸カルシウムの粒子を散布し、人工降雪を起こすのだ。',
      fr: "Lorsque le vol de Xueyi survole les Alpes, ce n'est plus la banquise dont ils se souviennent.\n\nLa grande langue glaciaire se brise. La glace bleue condensée sur dix mille ans gémit sous la chaleur, et les crevasses s'étendent en toile sur la surface. Dans un craquement assourdissant, la moitié d'une falaise s'effondre dans le lac trouble en contrebas, soulevant une vague noire de dix mètres.\n\nSous la falaise qui tombe, une nation mène un essai secret : pulvériser des particules de sulfate de calcium sur le glacier pour ensemencer de la neige artificielle.",
    },
    choices: [
      {
        id: 'c6a',
        text: { zh: '泄露给媒体', en: 'Leak it to the press', ja: 'メディアに暴露する', fr: 'Divulguer à la presse' },
        description: {
          zh: '把试验现场的画面与数据全部公开。',
          en: 'Publish all the footage and data from the trial site.',
          ja: '実験現場の映像とデータをすべて公開する。',
          fr: "Publier toutes les images et données du site d'essai.",
        },
        effects: { radical: 20, cooperation: 10 },
        animation: 'hope_a',
        consequences: {
          zh: '舆论沸腾：多国紧急暂停实验，但导致外交僵局。若激进值 ≥50，将直接引发全球气候紧急状态。',
          en: 'Outrage erupts: several nations suspend the trials, but diplomacy deadlocks. If radicality is ≥ 50, a global climate emergency is triggered outright.',
          ja: '世論が沸騰：複数の国が実験を緊急停止するが、外交はこう着状態に。過激値が50以上なら、全球的な気候非常事態が直接引き起こされる。',
          fr: "Vive indignation : plusieurs nations suspendent les essais, mais la diplomatie se bloque. Si la radicalité atteint 50, un état d'urgence climatique mondial est déclenché.",
        },
        nextState: { climateEmergency: true },
        nextChapter: 7,
      },
      {
        id: 'c6b',
        text: { zh: '协助完善技术', en: 'Help refine the technology', ja: '技術の完成に協力する', fr: 'Aider à perfectionner la technique' },
        description: {
          zh: '与科学家一起校准喷洒参数，把人工降雪变成可控的工具。',
          en: 'Work with the scientists to calibrate the spray and turn snow-seeding into a controllable tool.',
          ja: '科学者とともに散布のパラメータを調整し、人工降雪を制御可能な道具へと変える。',
          fr: "Travailler avec les scientifiques pour calibrer la pulvérisation et faire de l'ensemencement un outil maîtrisable.",
        },
        effects: { cooperation: 20, health: -10 },
        animation: 'doom_a',
        consequences: {
          zh: '解锁「大气冷凝器」科技树。风险：可能引发不可控的天气变异。',
          en: 'The "Atmospheric Condenser" tech tree is unlocked. Risk: uncontrollable weather mutations.',
          ja: '「大気凝縮器」の科技ツリーを解放。リスク：制御不能な気象変異を引き起こす可能性。',
          fr: "L'arbre technologique « Condenseur Atmosphérique » est débloqué. Risque : des mutations météorologiques incontrôlables.",
        },
        nextState: { condenserTech: true },
        nextChapter: 7,
      },
    ],
  },

  /* ───────────────────────── 第七章 ───────────────────────── */
  {
    id: 7,
    video: 'geese_flying',
    title: { zh: '生死抉择', en: 'Life or Death', ja: '生死の選択', fr: 'Vie ou Mort' },
    description: {
      zh: 'IPCC 报告全屏弹出 ——\n\n🔥 1.5℃ 温升将消灭 70% 的冰川。\n\n雁群悬停在热气流上方。幼雁的翅膀已经开始颤抖。\n\n冰刃把獠牙收了起来，第一次露出疲惫："两条路，选一条。我们撑得住，孩子们撑不住。"',
      en: 'The IPCC report fills the screen —\n\n🔥 A 1.5 °C rise will wipe out 70 % of the glaciers.\n\nThe flock hovers above the thermal currents. The youngest geese are already shivering.\n\nIceblade sheathes its fangs and, for the first time, looks exhausted: "Two roads. Pick one. We can take it. The children can\'t."',
      ja: 'IPCCの報告書が画面いっぱいに現れる ——\n\n🔥 1.5℃の気温上昇で、氷河の70%が失われる。\n\n群れは上昇気流の上に静止する。若い雁の翼はすでに震えはじめている。\n\nビンレンは牙を収め、初めて疲れた顔を見せる：「道は二つ。一つ選べ。我らは耐えられる。子どもらは耐えられない。」',
      fr: "Le rapport du GIEC remplit l'écran —\n\n🔥 Une hausse de 1,5 °C anéantira 70 % des glaciers.\n\nLe vol plane au-dessus des courants thermiques. Les plus jeunes oies tremblent déjà.\n\nIceblade rengaine ses crocs et, pour la première fois, semble épuisé : « Deux chemins. Choisis-en un. Nous pouvons tenir. Pas les petits. »",
    },
    choices: [
      {
        id: 'c7a',
        text: { zh: '牺牲迁徙路线', en: 'Sacrifice the migration route', ja: '渡りの航路を犠牲にする', fr: 'Sacrifier la route migratoire' },
        description: {
          zh: '雁群用身体阻挡热气流，为幼雁挡下最滚烫的一程。',
          en: 'The flock bodies block the thermal currents, shielding the young from the hottest stretch.',
          ja: '群れはその身で上昇気流を阻み、若い雁を最も熱い区間から守る。',
          fr: "Les corps du vol bloquent les courants brûlants, abritant les jeunes du segment le plus chaud.",
        },
        effects: { health: -50, cooperation: 25, radical: -5 },
        animation: 'adaptation_b',
        consequences: {
          zh: '族群数量 −50%，但大幅提升走向「黎明」结局的概率。',
          en: 'Population −50 %, but the odds of the "Dawn" ending rise sharply.',
          ja: '個体数 −50%。だが「夜明け」の結末へ至る確率が大きく上がる。',
          fr: "Population −50 %, mais les chances de la fin « Aube » augmentent fortement.",
        },
        nextState: { sacrificed: true },
        nextChapter: 8,
      },
      {
        id: 'c7b',
        text: { zh: '寻找新栖息地', en: 'Seek a new habitat', ja: '新しい生息地を探す', fr: 'Chercher un nouvel habitat' },
        description: {
          zh: '转向南半球，寻找尚未被高温吞没的水源。',
          en: 'Turn south, toward waters the heat has not yet swallowed.',
          ja: '南半球へ向きを変え、まだ高温に飲み込まれていない水源を探す。',
          fr: "Mettre le cap au sud, vers des eaux que la chaleur n'a pas encore englouties.",
        },
        effects: { health: 10, radical: 10 },
        animation: 'flock_c',
        consequences: {
          zh: '解锁澳洲地图：遭遇袋鼠与野兔争夺水源，需要适应 38℃ 高温与有毒藻类。',
          en: 'The Australia map is unlocked: kangaroos and hares fight you for water, and you must adapt to 38 °C heat and toxic algae.',
          ja: 'オーストラリアの地図を解放：カンガルーや野ウサギと水源を争い、38℃の高温と有毒藻類に適応する必要がある。',
          fr: "La carte de l'Australie est débloquée : kangourous et lièvres se disputent l'eau, et il faut s'adapter à 38 °C et aux algues toxiques.",
        },
        nextState: { newHabitat: true },
        nextChapter: 8,
      },
    ],
  },

  /* ───────────────────────── 第八章 ───────────────────────── */
  {
    id: 8,
    video: 'ch08_summit',
    title: { zh: '最终抉择', en: 'The Final Choice', ja: '最後の決断', fr: 'Le Choix Final' },
    description: {
      zh: '格陵兰冰盖崩塌预警 —— 72 小时倒计时。\n\n联合国大厅里，各国代表争论不休。穹顶屏幕上是实时海平面曲线，每一条都在向上。\n\n雪翼停在同声传译的玻璃罩外，翅膀上还带着冰芯的碎屑。它要在这 72 小时里，替所有无法开口的生灵，说一句话。',
      en: 'Greenland ice sheet collapse warning — T minus 72 hours.\n\nIn the UN hall the delegates argue without pause. On the domed screen, live sea-level curves, every one of them climbing.\n\nXueyi perches outside the glass booth of the interpreters, ice-core grit still on her wings. In these 72 hours she must say one sentence — for every creature that has no voice.',
      ja: 'グリーンランド氷床の崩壊警報 —— 72時間のカウントダウン。\n\n国連の大広間で、各国の代表が絶え間なく論争している。ドームのスクリーンにはリアルタイムの海面曲線、そのどれもが上昇している。\n\nシュエイーは同時通訳のガラスブースの外にとまり、翼にはまだ氷床の破片がついている。この72時間のなかで、声を持たぬすべての生き物のために、たった一言を告げねばならない。',
      fr: "Alerte à l'effondrement de la calotte groenlandaise — J moins 72 heures.\n\nDans la salle de l'ONU, les délégués débattent sans trêve. Sur l'écran du dôme, les courbes du niveau marin en direct, toutes ascendantes.\n\nXueyi se perche hors de la cabine vitrée des interprètes, des éclats de carotte glaciaire encore sur ses ailes. En 72 heures, elle doit dire une phrase — pour toutes les créatures sans voix.",
    },
    choices: [
      {
        id: 'c8a',
        text: { zh: '启动全球紧急计划', en: 'Activate the global emergency plan', ja: '全球緊急計画を発動する', fr: "Lancer le plan d'urgence mondial" },
        description: {
          zh: '推动 G20 峰会签署约束性协议，代价是全球经济倒退 20 年。',
          en: 'Push the G20 to sign a binding accord — at the price of a 20-year global economic recession.',
          ja: 'G20サミットで拘束力のある協定に署名させる。代償は世界経済の20年後退。',
          fr: "Pousser le G20 à signer un accord contraignant — au prix d'un recul économique mondial de 20 ans.",
        },
        condition: (state, stats) => stats.cooperation >= 50,
        conditionHint: {
          zh: '需要合作值 ≥ 50，否则 G20 峰会谈判破裂',
          en: 'Requires cooperation ≥ 50, otherwise the G20 talks collapse',
          ja: '協力値 ≥ 50 が必要。満たなければ G20 交渉は決裂する',
          fr: 'Nécessite une coopération ≥ 50, sinon les négociations du G20 échouent',
        },
        effects: { cooperation: 10, health: -10 },
        animation: 'hope_b',
        consequences: {
          zh: 'G20 峰会达成协议。股市熔断动画 —— 但冰盖的崩塌速度，第一次出现了放缓的迹象。',
          en: 'The G20 reaches an accord. Circuit-breaker animation on the markets — yet for the first time, the collapse of the ice sheet shows signs of slowing.',
          ja: 'G20サミットが合意に達する。株式市場のサーキットブレーカー —— だが、氷床の崩壊速度に初めて鈍化の兆しが現れる。',
          fr: "Le G20 conclut un accord. Coupe-circuit sur les marchés — mais pour la première fois, l'effondrement de la calotte ralentit.",
        },
        /* 结局细分：牺牲过迁徙路线，或「合作值高 + 雁群体力尚可」→ 希望结局；
           合作达标但雁群已筋疲力尽 → 适应结局（他乡）。 */
        endingRule: (state, stats) =>
          state.sacrificed || (stats.cooperation >= 85 && stats.health >= 50)
            ? 'hope'
            : 'adaptation',
      },
      {
        id: 'c8b',
        text: { zh: '等待技术修复', en: 'Wait for technology to fix it', ja: '技術による修復を待つ', fr: 'Attendre la réparation technique' },
        description: {
          zh: '把希望寄托在尚未成熟的大气冷凝器上，维持现状。',
          en: 'Stake everything on the unproven atmospheric condenser and hold the status quo.',
          ja: '未完成の大気凝縮器に望みを託し、現状を維持する。',
          fr: "Miser sur le condenseur atmosphérique encore inachevé et maintenir le statu quo.",
        },
        effects: { cooperation: -20, radical: 10 },
        animation: 'ch01_excavator_alt',
        consequences: {
          zh: '97% 概率触发末日结局。',
          en: 'A 97 % chance of triggering the doomsday ending.',
          ja: '97%の確率で終末の結末を引き起こす。',
          fr: "97 % de chances de déclencher la fin apocalyptique.",
        },
        ending: 'doom',
      },
    ],
  },
]

/** 全部被引用的视频资源名（用于首屏清单与预取规划） */
export const ALL_VIDEOS = [
  'ch01_glacier_crack',
  'geese_flying',
  'ch01_mining_robots',
  'ch01_excavator',
  'ch01_excavator_alt',
  'closeup_eye',
  'ch03_night_a',
  'ch03_night_b',
  'ch02_council_a',
  'ch02_council_b',
  'ch04_lab',
  'ch06_media_tv',
  'ch08_summit',
  'transition_timelapse',
  'flock_a',
  'flock_b',
  'flock_c',
  'hope_a',
  'hope_b',
  'ending_hope',
  'ending_adaptation',
  'adaptation_b',
  'doom_a',
  'ending_doom',
  'choice_contact_scientist',
  'choice_animal_protest',
  'choice_expose_lies',
]

/** L0：首屏必需 —— 第一章正片。必须最优先、体积最小地拿到。 */
export const L0_VIDEOS = ['ch01_glacier_crack']
