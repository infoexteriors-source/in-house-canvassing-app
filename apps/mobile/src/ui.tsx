import type {ReactNode} from 'react';
import {View,Text,TextInput,Pressable,StyleSheet,type TextInputProps,type ViewStyle,type StyleProp} from 'react-native';
/* shadcn/ui-style primitives for the field app, themed to match apps/dashboard (src/index.css). */
export const c={background:'#f5f2eb',card:'#ffffff',foreground:'#1e1b18',muted:'#efebe3',mutedForeground:'#625c54',border:'#e3ded4',input:'#d9d3c8',primary:'#b23a21',primarySoft:'#fbede8',sidebar:'#1a1816',sidebarAccent:'#2d2925',sidebarForeground:'#ece8e1',success:'#24684f',successSoft:'#e3f0e8',warning:'#8a5a0b',warningSoft:'#fbf0d6',danger:'#b4232a',dangerSoft:'#fbede8',info:'#345bd6',infoSoft:'#edf1fc'};
type Variant='default'|'outline'|'secondary'|'ghost'|'destructive'|'inverse';
const buttonVariants:Record<Variant,{box:ViewStyle;text:string}>={default:{box:{backgroundColor:c.primary},text:'#ffffff'},outline:{box:{backgroundColor:c.card,borderWidth:1,borderColor:c.input},text:c.foreground},secondary:{box:{backgroundColor:c.muted},text:c.foreground},ghost:{box:{backgroundColor:'transparent'},text:c.foreground},destructive:{box:{backgroundColor:'#8c2715'},text:'#ffffff'},inverse:{box:{backgroundColor:'rgba(255,255,255,0.08)',borderWidth:1,borderColor:'rgba(255,255,255,0.22)'},text:'#ffffff'}};
export function Button({title,onPress,variant='default',size='default',disabled=false,style}:{title:string;onPress:()=>void;variant?:Variant;size?:'sm'|'default'|'lg';disabled?:boolean;style?:StyleProp<ViewStyle>}){const v=buttonVariants[variant];return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[ui.button,size==='sm'?ui.buttonSm:size==='lg'?ui.buttonLg:null,v.box,variant==='default'||variant==='outline'?ui.shadowXs:null,pressed?{opacity:.85}:null,disabled?{opacity:.5}:null,style]}><Text style={[ui.buttonText,size==='lg'?{fontSize:17}:null,{color:v.text}]}>{title}</Text></Pressable>;}
export function Card({children,style}:{children:ReactNode;style?:StyleProp<ViewStyle>}){return <View style={[ui.card,style]}>{children}</View>;}
type Tone='neutral'|'success'|'warning'|'danger'|'info'|'primary';
const tones:Record<Tone,[string,string]>={neutral:[c.muted,c.foreground],success:[c.successSoft,c.success],warning:[c.warningSoft,c.warning],danger:[c.dangerSoft,c.danger],info:[c.infoSoft,c.info],primary:[c.primarySoft,c.primary]};
export function Badge({label,tone='neutral',dot}:{label:string;tone?:Tone;dot?:string}){const [bg,fg]=tones[tone];return <View style={[ui.badge,{backgroundColor:bg}]}><View style={[ui.badgeDot,{backgroundColor:dot??fg}]}/><Text style={[ui.badgeText,{color:fg}]}>{label}</Text></View>;}
export function Alert({title,children,tone='warning',onPress}:{title?:string;children?:ReactNode;tone?:Tone;onPress?:()=>void}){const [bg,fg]=tones[tone];const body=<View style={[ui.alert,{backgroundColor:bg,borderColor:fg+'33'}]}>{title?<Text style={[ui.alertTitle,{color:fg}]}>{title}</Text>:null}{typeof children==='string'?<Text style={[ui.alertText,{color:fg}]}>{children}</Text>:children}</View>;return onPress?<Pressable accessibilityRole="button" onPress={onPress}>{body}</Pressable>:body;}
export function Field({label,hint,...props}:TextInputProps&{label:string;hint?:string}){return <View style={ui.field}><Text style={ui.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor="#9c958b" {...props} style={[ui.input,props.multiline?{minHeight:96,textAlignVertical:'top',paddingTop:12}:null,props.style]}/>{hint?<Text style={ui.hint}>{hint}</Text>:null}</View>;}
export function SectionLabel({children}:{children:string}){return <Text style={ui.sectionLabel}>{children.toUpperCase()}</Text>;}
export function Title({children,inverse=false}:{children:ReactNode;inverse?:boolean}){return <Text accessibilityRole="header" style={[ui.title,inverse?{color:'#ffffff'}:null]}>{children}</Text>;}
export function Tabs<T extends string>({value,onChange,items}:{value:T;onChange:(value:T)=>void;items:{value:T;label:string;badge?:number}[]}){return <View style={ui.tabs} accessibilityRole="tablist">{items.map(item=>{const on=item.value===value;return <Pressable key={item.value} accessibilityRole="tab" accessibilityState={{selected:on}} onPress={()=>onChange(item.value)} style={ui.tab}><View style={[ui.tabPill,on?{backgroundColor:c.primarySoft}:null]}><Text style={[ui.tabText,on?{color:c.primary,fontWeight:'700'}:null]}>{item.label}</Text>{item.badge?<View style={ui.tabBadge}><Text style={ui.tabBadgeText}>{item.badge}</Text></View>:null}</View></Pressable>;})}</View>;}
export const ui=StyleSheet.create({
 shadowXs:{shadowColor:'#000',shadowOpacity:.05,shadowRadius:2,shadowOffset:{width:0,height:1},elevation:1},
 button:{minHeight:44,borderRadius:8,paddingHorizontal:16,paddingVertical:10,alignItems:'center',justifyContent:'center',flexDirection:'row'},
 buttonSm:{minHeight:44,paddingHorizontal:12,paddingVertical:8},
 buttonLg:{minHeight:56,borderRadius:10,paddingHorizontal:20},
 buttonText:{fontSize:15,fontWeight:'600'},
 card:{backgroundColor:c.card,borderWidth:1,borderColor:c.border,borderRadius:12,padding:16,gap:10,shadowColor:'#000',shadowOpacity:.05,shadowRadius:2,shadowOffset:{width:0,height:1},elevation:1},
 badge:{flexDirection:'row',alignItems:'center',alignSelf:'flex-start',gap:6,borderRadius:999,paddingHorizontal:9,paddingVertical:3},
 badgeDot:{width:7,height:7,borderRadius:4},
 badgeText:{fontSize:12,fontWeight:'600'},
 alert:{borderWidth:1,borderRadius:10,padding:12,gap:4},
 alertTitle:{fontSize:14,fontWeight:'700'},
 alertText:{fontSize:14,lineHeight:20},
 field:{gap:6},
 label:{fontSize:14,fontWeight:'600',color:c.foreground},
 hint:{fontSize:13,color:c.mutedForeground,lineHeight:18},
 input:{minHeight:52,borderWidth:1,borderColor:c.input,borderRadius:8,backgroundColor:c.card,paddingHorizontal:14,fontSize:17,color:c.foreground,shadowColor:'#000',shadowOpacity:.04,shadowRadius:2,shadowOffset:{width:0,height:1}},
 sectionLabel:{fontSize:12,fontWeight:'700',letterSpacing:1.4,color:c.mutedForeground},
 title:{fontSize:34,fontWeight:'800',letterSpacing:-.6,color:c.foreground},
 tabs:{flexDirection:'row',backgroundColor:c.card,borderTopWidth:1,borderTopColor:c.border,paddingHorizontal:8,paddingTop:6,paddingBottom:6,gap:4},
 tab:{flex:1,minHeight:52,alignItems:'center',justifyContent:'center'},
 tabPill:{minHeight:36,paddingHorizontal:12,borderRadius:18,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:6},
 tabText:{fontSize:13,fontWeight:'600',color:c.mutedForeground},
 tabBadge:{minWidth:18,height:18,borderRadius:9,backgroundColor:c.primary,alignItems:'center',justifyContent:'center',paddingHorizontal:5},
 tabBadgeText:{color:'#ffffff',fontSize:11,fontWeight:'700'},
});
