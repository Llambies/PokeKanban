import type { LucideIcon } from 'lucide-react';
import {
  AlarmClock, Anchor, Apple, Archive, Award, Baby, Ban, BarChart3, Bell, Bike, Bird, BookOpen, Bookmark, Brain,
  Briefcase, Bug, Building2, CakeSlice, Calculator, Calendar, Camera, Car, Cat, CircleCheck, CircleDot, CircleHelp,
  CircleX, ClipboardList, Clock, Cloud, Code, Coffee, Compass, Construction, Cpu, CreditCard, Crown, Database,
  Diamond, Dog, Droplet, Dumbbell, Eye, Feather, FileText, Film, Fish, Flag, Flame, Flower2, Folder, Gamepad2, Gem,
  Ghost, Gift, GitBranch, Globe, GraduationCap, Hammer, Hand, Headphones, Heart, Hourglass, House, Inbox, Info, Key,
  Laptop, Layers, Leaf, Lightbulb, Link, ListChecks, Lock, Mail, MapPin, Megaphone, MessageSquare, Mic, Monitor, Moon,
  Mountain, Music, Package, Palette, Paperclip, PartyPopper, Pencil, Phone, PiggyBank, Pill, Pin, Pizza, Plane,
  Recycle, Repeat, Rocket, Salad, Scissors, Search, Send, Server, Settings, Shield, ShoppingCart, Skull, Smartphone,
  Smile, Snowflake, Sparkles, Sprout, Star, Stethoscope, Sun, Swords, Tag, Target, Tent, Terminal, ThumbsDown,
  ThumbsUp, Timer, Train, TreePine, TrendingUp, TriangleAlert, Trophy, Truck, Umbrella, User, Users, Utensils, Wallet,
  Wand2, Waves, Wifi, Wrench, Zap,
} from 'lucide-react';

export interface IconDef {
  name: string;
  Icon: LucideIcon;
  /** Spanish keywords used by the icon search. */
  keywords: string;
}

const RAW: [string, LucideIcon, string][] = [
  ['Star', Star, 'estrella favorito importante'],
  ['Flame', Flame, 'fuego urgente caliente'],
  ['Zap', Zap, 'rayo rapido energia electrico'],
  ['Bug', Bug, 'bicho error fallo'],
  ['TriangleAlert', TriangleAlert, 'alerta aviso peligro'],
  ['CircleCheck', CircleCheck, 'hecho completado ok'],
  ['CircleX', CircleX, 'cancelado error no'],
  ['Ban', Ban, 'bloqueado prohibido'],
  ['CircleHelp', CircleHelp, 'pregunta duda ayuda'],
  ['Info', Info, 'informacion nota'],
  ['Flag', Flag, 'bandera hito meta'],
  ['Bookmark', Bookmark, 'marcador guardar'],
  ['Tag', Tag, 'etiqueta'],
  ['Pin', Pin, 'chincheta fijado'],
  ['Heart', Heart, 'corazon amor favorito'],
  ['Lightbulb', Lightbulb, 'idea bombilla'],
  ['Sparkles', Sparkles, 'nuevo brillo magia'],
  ['Wand2', Wand2, 'magia varita mejora'],
  ['Rocket', Rocket, 'cohete lanzamiento'],
  ['Target', Target, 'objetivo diana meta'],
  ['Trophy', Trophy, 'trofeo logro'],
  ['Award', Award, 'premio medalla'],
  ['Crown', Crown, 'corona vip'],
  ['Gem', Gem, 'gema joya valor'],
  ['Diamond', Diamond, 'diamante'],
  ['Clock', Clock, 'reloj tiempo hora'],
  ['AlarmClock', AlarmClock, 'alarma despertador'],
  ['Timer', Timer, 'temporizador cronometro'],
  ['Hourglass', Hourglass, 'reloj arena espera'],
  ['Calendar', Calendar, 'calendario fecha evento'],
  ['Repeat', Repeat, 'repetir recurrente'],
  ['ListChecks', ListChecks, 'lista tareas checklist'],
  ['ClipboardList', ClipboardList, 'portapapeles lista'],
  ['Inbox', Inbox, 'bandeja entrada'],
  ['Archive', Archive, 'archivo caja'],
  ['Package', Package, 'paquete envio'],
  ['Truck', Truck, 'camion envio reparto'],
  ['Code', Code, 'codigo programacion'],
  ['Terminal', Terminal, 'terminal consola'],
  ['GitBranch', GitBranch, 'git rama'],
  ['Database', Database, 'base datos'],
  ['Server', Server, 'servidor'],
  ['Cpu', Cpu, 'procesador hardware'],
  ['Monitor', Monitor, 'pantalla ordenador'],
  ['Laptop', Laptop, 'portatil'],
  ['Smartphone', Smartphone, 'movil telefono'],
  ['Wifi', Wifi, 'red internet'],
  ['Globe', Globe, 'web mundo internet'],
  ['Link', Link, 'enlace'],
  ['Lock', Lock, 'candado privado seguridad'],
  ['Key', Key, 'llave clave'],
  ['Shield', Shield, 'escudo seguridad'],
  ['Settings', Settings, 'ajustes configuracion'],
  ['Wrench', Wrench, 'llave herramienta arreglar'],
  ['Hammer', Hammer, 'martillo construir'],
  ['Construction', Construction, 'obras construccion'],
  ['Scissors', Scissors, 'tijeras cortar'],
  ['Paperclip', Paperclip, 'clip adjunto'],
  ['Pencil', Pencil, 'lapiz editar escribir'],
  ['FileText', FileText, 'documento archivo texto'],
  ['Folder', Folder, 'carpeta'],
  ['BookOpen', BookOpen, 'libro leer estudio'],
  ['GraduationCap', GraduationCap, 'estudio universidad curso'],
  ['Brain', Brain, 'cerebro pensar'],
  ['Palette', Palette, 'diseño arte color'],
  ['Camera', Camera, 'camara foto'],
  ['Film', Film, 'pelicula video'],
  ['Music', Music, 'musica'],
  ['Headphones', Headphones, 'auriculares audio'],
  ['Mic', Mic, 'microfono podcast'],
  ['Megaphone', Megaphone, 'megafono anuncio marketing'],
  ['Mail', Mail, 'correo email'],
  ['MessageSquare', MessageSquare, 'mensaje chat comentario'],
  ['Phone', Phone, 'telefono llamada'],
  ['Send', Send, 'enviar'],
  ['Bell', Bell, 'campana notificacion recordatorio'],
  ['Search', Search, 'buscar investigar'],
  ['Eye', Eye, 'ojo revisar ver'],
  ['User', User, 'persona usuario'],
  ['Users', Users, 'personas equipo'],
  ['Baby', Baby, 'bebe'],
  ['Hand', Hand, 'mano'],
  ['ThumbsUp', ThumbsUp, 'bien me gusta'],
  ['ThumbsDown', ThumbsDown, 'mal no me gusta'],
  ['Smile', Smile, 'sonrisa feliz'],
  ['PartyPopper', PartyPopper, 'fiesta celebrar'],
  ['Gift', Gift, 'regalo'],
  ['CakeSlice', CakeSlice, 'tarta cumpleaños'],
  ['Briefcase', Briefcase, 'trabajo maletin'],
  ['Building2', Building2, 'edificio empresa oficina'],
  ['House', House, 'casa hogar'],
  ['ShoppingCart', ShoppingCart, 'compra carrito'],
  ['CreditCard', CreditCard, 'tarjeta pago'],
  ['Wallet', Wallet, 'cartera dinero'],
  ['PiggyBank', PiggyBank, 'ahorro hucha dinero'],
  ['Calculator', Calculator, 'calculadora cuentas'],
  ['BarChart3', BarChart3, 'grafico estadisticas'],
  ['TrendingUp', TrendingUp, 'crecimiento tendencia'],
  ['Layers', Layers, 'capas'],
  ['Plane', Plane, 'avion viaje'],
  ['Car', Car, 'coche'],
  ['Train', Train, 'tren'],
  ['Bike', Bike, 'bici'],
  ['MapPin', MapPin, 'lugar mapa ubicacion'],
  ['Compass', Compass, 'brujula explorar'],
  ['Tent', Tent, 'camping acampada'],
  ['Mountain', Mountain, 'montaña'],
  ['TreePine', TreePine, 'arbol pino'],
  ['Leaf', Leaf, 'hoja naturaleza'],
  ['Sprout', Sprout, 'brote crecer planta'],
  ['Flower2', Flower2, 'flor'],
  ['Recycle', Recycle, 'reciclar'],
  ['Sun', Sun, 'sol dia'],
  ['Moon', Moon, 'luna noche'],
  ['Cloud', Cloud, 'nube'],
  ['Umbrella', Umbrella, 'paraguas lluvia'],
  ['Snowflake', Snowflake, 'nieve frio hielo'],
  ['Droplet', Droplet, 'gota agua'],
  ['Waves', Waves, 'olas mar agua'],
  ['Feather', Feather, 'pluma ligero'],
  ['Anchor', Anchor, 'ancla'],
  ['Coffee', Coffee, 'cafe'],
  ['Utensils', Utensils, 'comida cubiertos'],
  ['Pizza', Pizza, 'pizza comida'],
  ['Salad', Salad, 'ensalada saludable'],
  ['Apple', Apple, 'manzana fruta'],
  ['Dumbbell', Dumbbell, 'gimnasio ejercicio pesas'],
  ['Pill', Pill, 'pastilla medicina salud'],
  ['Stethoscope', Stethoscope, 'medico salud'],
  ['Gamepad2', Gamepad2, 'juego videojuego mando'],
  ['Swords', Swords, 'espadas batalla combate'],
  ['Ghost', Ghost, 'fantasma'],
  ['Skull', Skull, 'calavera peligro'],
  ['Dog', Dog, 'perro mascota'],
  ['Cat', Cat, 'gato mascota'],
  ['Bird', Bird, 'pajaro'],
  ['Fish', Fish, 'pez'],
  ['CircleDot', CircleDot, 'punto circulo'],
];

export const ICONS: IconDef[] = RAW.map(([name, Icon, keywords]) => ({ name, Icon, keywords }));

const BY_NAME = new Map(ICONS.map((d) => [d.name, d]));

export const LUCIDE_PREFIX = 'lucide:';

export function lucideIconValue(name: string): string {
  return LUCIDE_PREFIX + name;
}

export function getLucideIcon(value: string | null | undefined): LucideIcon | null {
  if (!value || !value.startsWith(LUCIDE_PREFIX)) return null;
  return BY_NAME.get(value.slice(LUCIDE_PREFIX.length))?.Icon ?? null;
}

export function searchIcons(query: string): IconDef[] {
  const q = normalize(query);
  if (!q) return ICONS;
  return ICONS.filter((d) => normalize(d.name).includes(q) || normalize(d.keywords).includes(q));
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export const EMOJIS = [
  '🔥', '⭐', '⚡', '🐛', '🚀', '✅', '❌', '⚠️', '❓', '💡', '📌', '📎', '🏷️', '🎯', '🏆', '🎉',
  '❤️', '💙', '💚', '💛', '💜', '🧡', '🖤', '🤍', '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪',
  '📅', '⏰', '⏳', '🔁', '📝', '📚', '📖', '✏️', '🖊️', '📁', '🗂️', '📦', '🛒', '💰', '💳', '🏦',
  '💻', '🖥️', '📱', '⌨️', '🔧', '🔨', '🛠️', '⚙️', '🔒', '🔑', '🛡️', '🌐', '🔗', '📡', '🧪', '🔬',
  '🏠', '🏢', '✈️', '🚗', '🚲', '🗺️', '🏖️', '⛺', '🏔️', '🌳', '🌱', '🌸', '☀️', '🌙', '☁️', '❄️',
  '🍎', '🍕', '☕', '🍺', '🎂', '🏋️', '⚽', '🎮', '🎲', '🎵', '🎬', '📷', '🎨', '🧠', '💊', '🩺',
  '🐶', '🐱', '🐦', '🐟', '🦊', '🐉', '👻', '💀', '🤖', '👾', '🧙', '🦄', '👍', '👎', '🙌', '💪',
  '😀', '😎', '🤔', '😴', '😡', '🥳', '🤯', '🙈', '👀', '💬', '📣', '🔔', '🎁', '💎', '👑', '🍀',
];
