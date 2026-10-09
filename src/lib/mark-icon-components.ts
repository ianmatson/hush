import type { Component } from 'svelte';
import IconBug from '@lucide/svelte/icons/bug';
import IconSparkles from '@lucide/svelte/icons/sparkles';
import IconFlame from '@lucide/svelte/icons/flame';
import IconShield from '@lucide/svelte/icons/shield';
import IconShieldAlert from '@lucide/svelte/icons/shield-alert';
import IconRocket from '@lucide/svelte/icons/rocket';
import IconWrench from '@lucide/svelte/icons/wrench';
import IconHammer from '@lucide/svelte/icons/hammer';
import IconPackage from '@lucide/svelte/icons/package';
import IconBookOpen from '@lucide/svelte/icons/book-open';
import IconFileText from '@lucide/svelte/icons/file-text';
import IconPalette from '@lucide/svelte/icons/palette';
import IconPaintbrush from '@lucide/svelte/icons/paintbrush';
import IconTestTube from '@lucide/svelte/icons/test-tube';
import IconFlaskConical from '@lucide/svelte/icons/flask-conical';
import IconGauge from '@lucide/svelte/icons/gauge';
import IconSignalLow from '@lucide/svelte/icons/signal-low';
import IconSignalMedium from '@lucide/svelte/icons/signal-medium';
import IconSignalHigh from '@lucide/svelte/icons/signal-high';
import IconMinus from '@lucide/svelte/icons/minus';
import IconChevronUp from '@lucide/svelte/icons/chevron-up';
import IconChevronsUp from '@lucide/svelte/icons/chevrons-up';
import IconZap from '@lucide/svelte/icons/zap';
import IconDatabase from '@lucide/svelte/icons/database';
import IconServer from '@lucide/svelte/icons/server';
import IconCloud from '@lucide/svelte/icons/cloud';
import IconLock from '@lucide/svelte/icons/lock';
import IconKey from '@lucide/svelte/icons/key';
import IconGlobe from '@lucide/svelte/icons/globe';
import IconSmartphone from '@lucide/svelte/icons/smartphone';
import IconMonitor from '@lucide/svelte/icons/monitor';
import IconCode from '@lucide/svelte/icons/code';
import IconTerminal from '@lucide/svelte/icons/terminal';
import IconGitBranch from '@lucide/svelte/icons/git-branch';
import IconGitMerge from '@lucide/svelte/icons/git-merge';
import IconGitPullRequest from '@lucide/svelte/icons/git-pull-request';
import IconLayers from '@lucide/svelte/icons/layers';
import IconPuzzle from '@lucide/svelte/icons/puzzle';
import IconLightbulb from '@lucide/svelte/icons/lightbulb';
import IconStar from '@lucide/svelte/icons/star';
import IconHeart from '@lucide/svelte/icons/heart';
import IconFlag from '@lucide/svelte/icons/flag';
import IconBookmark from '@lucide/svelte/icons/bookmark';
import IconTag from '@lucide/svelte/icons/tag';
import IconFolder from '@lucide/svelte/icons/folder';
import IconInbox from '@lucide/svelte/icons/inbox';
import IconBell from '@lucide/svelte/icons/bell';
import IconMegaphone from '@lucide/svelte/icons/megaphone';
import IconMessageSquare from '@lucide/svelte/icons/message-square';
import IconUsers from '@lucide/svelte/icons/users';
import IconUser from '@lucide/svelte/icons/user';
import IconBot from '@lucide/svelte/icons/bot';
import IconCalendar from '@lucide/svelte/icons/calendar';
import IconClock from '@lucide/svelte/icons/clock';
import IconTimer from '@lucide/svelte/icons/timer';
import IconCalendarClock from '@lucide/svelte/icons/calendar-clock';
import IconHourglass from '@lucide/svelte/icons/hourglass';
import IconTarget from '@lucide/svelte/icons/target';
import IconTrophy from '@lucide/svelte/icons/trophy';
import IconChartLine from '@lucide/svelte/icons/chart-line';
import IconChartBar from '@lucide/svelte/icons/chart-bar';
import IconTrendingUp from '@lucide/svelte/icons/trending-up';
import IconDollarSign from '@lucide/svelte/icons/dollar-sign';
import IconCreditCard from '@lucide/svelte/icons/credit-card';
import IconShoppingCart from '@lucide/svelte/icons/shopping-cart';
import IconTruck from '@lucide/svelte/icons/truck';
import IconMapPin from '@lucide/svelte/icons/map-pin';
import IconCompass from '@lucide/svelte/icons/compass';
import IconAnchor from '@lucide/svelte/icons/anchor';
import IconLeaf from '@lucide/svelte/icons/leaf';
import IconSprout from '@lucide/svelte/icons/sprout';
import IconTreePine from '@lucide/svelte/icons/tree-pine';
import IconSun from '@lucide/svelte/icons/sun';
import IconMoon from '@lucide/svelte/icons/moon';
import IconSnowflake from '@lucide/svelte/icons/snowflake';
import IconUmbrella from '@lucide/svelte/icons/umbrella';
import IconCoffee from '@lucide/svelte/icons/coffee';
import IconPizza from '@lucide/svelte/icons/pizza';
import IconGift from '@lucide/svelte/icons/gift';
import IconMusic from '@lucide/svelte/icons/music';
import IconCamera from '@lucide/svelte/icons/camera';
import IconImage from '@lucide/svelte/icons/image';
import IconVideo from '@lucide/svelte/icons/video';
import IconMic from '@lucide/svelte/icons/mic';
import IconHeadphones from '@lucide/svelte/icons/headphones';
import IconGamepad2 from '@lucide/svelte/icons/gamepad-2';
import IconGraduationCap from '@lucide/svelte/icons/graduation-cap';
import IconBriefcase from '@lucide/svelte/icons/briefcase';
import IconBuilding from '@lucide/svelte/icons/building';
import IconHouse from '@lucide/svelte/icons/house';
import IconScale from '@lucide/svelte/icons/scale';
import IconGavel from '@lucide/svelte/icons/gavel';
import IconStethoscope from '@lucide/svelte/icons/stethoscope';
import IconPill from '@lucide/svelte/icons/pill';
import IconActivity from '@lucide/svelte/icons/activity';
import IconTriangleAlert from '@lucide/svelte/icons/triangle-alert';
import IconCircleAlert from '@lucide/svelte/icons/circle-alert';
import IconOctagonAlert from '@lucide/svelte/icons/octagon-alert';
import IconBan from '@lucide/svelte/icons/ban';
import IconCircleCheck from '@lucide/svelte/icons/circle-check';
import IconEye from '@lucide/svelte/icons/eye';
import IconSearch from '@lucide/svelte/icons/search';
import IconFunnel from '@lucide/svelte/icons/funnel';
import IconSettings from '@lucide/svelte/icons/settings';
import IconSlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
import IconRecycle from '@lucide/svelte/icons/recycle';
import IconArchive from '@lucide/svelte/icons/archive';
import IconBox from '@lucide/svelte/icons/box';
import IconBoxes from '@lucide/svelte/icons/boxes';
import IconCpu from '@lucide/svelte/icons/cpu';
import IconHardDrive from '@lucide/svelte/icons/hard-drive';
import IconWifi from '@lucide/svelte/icons/wifi';
import IconLink from '@lucide/svelte/icons/link';
import IconPaperclip from '@lucide/svelte/icons/paperclip';
import IconPenTool from '@lucide/svelte/icons/pen-tool';
import IconPencil from '@lucide/svelte/icons/pencil';
import IconScissors from '@lucide/svelte/icons/scissors';
import IconRuler from '@lucide/svelte/icons/ruler';
import IconBrush from '@lucide/svelte/icons/brush';
import IconFeather from '@lucide/svelte/icons/feather';
import IconLanguages from '@lucide/svelte/icons/languages';
import IconAccessibility from '@lucide/svelte/icons/accessibility';
import IconDog from '@lucide/svelte/icons/dog';
import IconCat from '@lucide/svelte/icons/cat';
import IconFish from '@lucide/svelte/icons/fish';
import IconBird from '@lucide/svelte/icons/bird';
import IconShapes from '@lucide/svelte/icons/shapes';
import IconConstruction from '@lucide/svelte/icons/construction';
import IconTrafficCone from '@lucide/svelte/icons/traffic-cone';
import IconSiren from '@lucide/svelte/icons/siren';
import IconSkull from '@lucide/svelte/icons/skull';
import IconGhost from '@lucide/svelte/icons/ghost';
import IconCrown from '@lucide/svelte/icons/crown';
import IconGem from '@lucide/svelte/icons/gem';

export const LUCIDE_COMPONENTS: Record<string, Component> = {
	bug: IconBug,
	sparkles: IconSparkles,
	flame: IconFlame,
	shield: IconShield,
	'shield-alert': IconShieldAlert,
	rocket: IconRocket,
	wrench: IconWrench,
	hammer: IconHammer,
	package: IconPackage,
	'book-open': IconBookOpen,
	'file-text': IconFileText,
	palette: IconPalette,
	paintbrush: IconPaintbrush,
	'test-tube': IconTestTube,
	'flask-conical': IconFlaskConical,
	gauge: IconGauge,
	'signal-low': IconSignalLow,
	'signal-medium': IconSignalMedium,
	'signal-high': IconSignalHigh,
	minus: IconMinus,
	'chevron-up': IconChevronUp,
	'chevrons-up': IconChevronsUp,
	zap: IconZap,
	database: IconDatabase,
	server: IconServer,
	cloud: IconCloud,
	lock: IconLock,
	key: IconKey,
	globe: IconGlobe,
	smartphone: IconSmartphone,
	monitor: IconMonitor,
	code: IconCode,
	terminal: IconTerminal,
	'git-branch': IconGitBranch,
	'git-merge': IconGitMerge,
	'git-pull-request': IconGitPullRequest,
	layers: IconLayers,
	puzzle: IconPuzzle,
	lightbulb: IconLightbulb,
	star: IconStar,
	heart: IconHeart,
	flag: IconFlag,
	bookmark: IconBookmark,
	tag: IconTag,
	folder: IconFolder,
	inbox: IconInbox,
	bell: IconBell,
	megaphone: IconMegaphone,
	'message-square': IconMessageSquare,
	users: IconUsers,
	user: IconUser,
	bot: IconBot,
	calendar: IconCalendar,
	clock: IconClock,
	timer: IconTimer,
	'calendar-clock': IconCalendarClock,
	hourglass: IconHourglass,
	target: IconTarget,
	trophy: IconTrophy,
	'chart-line': IconChartLine,
	'chart-bar': IconChartBar,
	'trending-up': IconTrendingUp,
	'dollar-sign': IconDollarSign,
	'credit-card': IconCreditCard,
	'shopping-cart': IconShoppingCart,
	truck: IconTruck,
	'map-pin': IconMapPin,
	compass: IconCompass,
	anchor: IconAnchor,
	leaf: IconLeaf,
	sprout: IconSprout,
	'tree-pine': IconTreePine,
	sun: IconSun,
	moon: IconMoon,
	snowflake: IconSnowflake,
	umbrella: IconUmbrella,
	coffee: IconCoffee,
	pizza: IconPizza,
	gift: IconGift,
	music: IconMusic,
	camera: IconCamera,
	image: IconImage,
	video: IconVideo,
	mic: IconMic,
	headphones: IconHeadphones,
	'gamepad-2': IconGamepad2,
	'graduation-cap': IconGraduationCap,
	briefcase: IconBriefcase,
	building: IconBuilding,
	house: IconHouse,
	scale: IconScale,
	gavel: IconGavel,
	stethoscope: IconStethoscope,
	pill: IconPill,
	activity: IconActivity,
	'triangle-alert': IconTriangleAlert,
	'circle-alert': IconCircleAlert,
	'octagon-alert': IconOctagonAlert,
	ban: IconBan,
	'circle-check': IconCircleCheck,
	eye: IconEye,
	search: IconSearch,
	funnel: IconFunnel,
	settings: IconSettings,
	'sliders-horizontal': IconSlidersHorizontal,
	recycle: IconRecycle,
	archive: IconArchive,
	box: IconBox,
	boxes: IconBoxes,
	cpu: IconCpu,
	'hard-drive': IconHardDrive,
	wifi: IconWifi,
	link: IconLink,
	paperclip: IconPaperclip,
	'pen-tool': IconPenTool,
	pencil: IconPencil,
	scissors: IconScissors,
	ruler: IconRuler,
	brush: IconBrush,
	feather: IconFeather,
	languages: IconLanguages,
	accessibility: IconAccessibility,
	dog: IconDog,
	cat: IconCat,
	fish: IconFish,
	bird: IconBird,
	shapes: IconShapes,
	construction: IconConstruction,
	'traffic-cone': IconTrafficCone,
	siren: IconSiren,
	skull: IconSkull,
	ghost: IconGhost,
	crown: IconCrown,
	gem: IconGem
};

const ICON_DIR = '/node_modules/@lucide/svelte/dist/icons/';
const LOADERS = import.meta.glob<Component>('/node_modules/@lucide/svelte/dist/icons/*.svelte', {
	import: 'default'
});

export const ALL_LUCIDE_IDS = Object.keys(LOADERS)
	.map((path) => path.slice(ICON_DIR.length, -'.svelte'.length))
	.sort();

const loaded = new Map<string, Promise<Component | null>>();

export function loadLucide(id: string): Promise<Component | null> {
	let icon = loaded.get(id);
	if (!icon) {
		const load = LOADERS[`${ICON_DIR}${id}.svelte`];
		icon = load ? load().catch(() => null) : Promise.resolve(null);
		loaded.set(id, icon);
	}
	return icon;
}
