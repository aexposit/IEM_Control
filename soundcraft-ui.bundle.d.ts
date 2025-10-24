import * as rxjs from 'rxjs';
import { Observable } from 'rxjs';

type ChannelType = 'i' | 'l' | 'p' | 'f' | 's' | 'a' | 'v';
type VolumeBusType = 'solovol' | 'hpvol';
type BusType = 'master' | 'aux' | 'fx';
interface SoundcraftUIOptions {
    /** IP address of the mixer */
    targetIP: string;
    /**
     * A WebSocket constructor to use. This is useful for situations like using a
     * WebSocket impl in Node (WebSocket is a DOM API), or for mocking a WebSocket
     * for testing purposes. By default, this library uses `WebSocket`
     * in the browser and falls back to `ws` on Node.js.
     */
    webSocketCtor?: {
        new (url: string, protocols?: string | string[]): WebSocket;
    };
}
declare enum ConnectionStatus {
    Opening = "OPENING",
    Open = "OPEN",
    Close = "CLOSE",
    Closing = "CLOSING",
    Error = "ERROR",
    Reconnecting = "RECONNECTING"
}
interface ConnectionStatusEvent {
    type: ConnectionStatus;
}
interface ConnectionErrorEvent extends ConnectionStatusEvent {
    type: ConnectionStatus.Error;
    payload: unknown;
}
type ConnectionEvent = ConnectionStatusEvent | ConnectionErrorEvent;
declare enum PlayerState {
    Stopped = 0,
    Playing = 2,
    Paused = 3
}
declare enum MtkState {
    Stopped = 0,
    Paused = 1,
    Playing = 2
}
declare enum FxType {
    None = -1,
    Reverb = 0,
    Delay = 1,
    Chorus = 2,
    Room = 3
}
type MixerModel = 'ui12' | 'ui16' | 'ui24';

declare class MixerConnection {
    /** time to wait before reconnecting after an error */
    private reconnectTime;
    /** period time for the keepalive interval messages */
    private keepaliveTime;
    private socket$;
    /**
     * closing the socket is not enough to finally end the connection.
     * socket$.complete() only works if the socket is open.
     * However, if there's a timed reconnect running, it will try to reconnect.
     * socket$.complete() will have no effect.
     * We have a separate notifier here to destroy the timed reconnect when the user actually wants to close everything
     */
    private forceClose$;
    /**
     * internal message streams.
     * can be fed from anywhere inside this class but must not be exposed
     */
    private statusSubject$;
    private outboundSubject$;
    private inboundSubject$;
    private _status;
    /** public message streams */
    /** Connection status stream */
    status$: rxjs.Observable<ConnectionEvent>;
    /** Connection status */
    get status(): ConnectionStatus;
    /** All outbound messages (from client to mixer) */
    outbound$: rxjs.Observable<string>;
    /** All inbound messages (from mixer to client) */
    inbound$: rxjs.Observable<string>;
    /** combined stream of inbound and outbound messages */
    allMessages$: rxjs.Observable<string>;
    constructor(options: SoundcraftUIOptions);
    /** Connect to socket and retry if connection lost */
    connect(): Promise<void>;
    /** Disconnect from socket */
    disconnect(): Promise<void>;
    /**
     * Reconnect to the mixer:
     * disconnect, then wait 1 second before connecting again
     */
    reconnect(): Promise<void>;
    /**
     * Send command to the mixer
     * @param msg Message to send, e.g. `SETD^i.2.mute^1`
     */
    sendMessage(msg: string): void;
}

/**
 * Store for facade objects
 * This is used to cache channels and others so that they don't need to be recreated all the time.
 * This is just a wrapper around a "Map" object, but we like to keep it abstract.
 */
declare class ObjectStore {
    private store;
    get<T>(id: string): T;
    set(id: string, value: unknown): void;
}

declare class MixerStore {
    private conn;
    /** Internal filtered stream of matched SETD and SETS messages */
    private setdSetsMessageMatches$;
    /** Stream of raw SETD and SETS messages */
    readonly messages$: rxjs.Observable<string>;
    /** The full mixer state as a flat object. Updates whenever the state changes. */
    readonly state$: rxjs.Connectable<any>;
    /**
     * Stream of channel sync states.
     * Each value is an object with syncId keys and index values.
     */
    readonly syncState$: rxjs.Connectable<Record<string, number>>;
    readonly objectStore: ObjectStore;
    constructor(conn: MixerConnection);
}

type AutomixGroupId = 'a' | 'b';
declare class AutomixGroup {
    private conn;
    private store;
    private group;
    /** Active state of this automix group (`0` or `1`) */
    state$: rxjs.Observable<number>;
    constructor(conn: MixerConnection, store: MixerStore, group: AutomixGroupId);
    private setState;
    /** Enable this automix group */
    enable(): void;
    /** Disable this automix group */
    disable(): void;
    /** Toggle the state of this automix group */
    toggle(): void;
}
/**
 * Controller for Automix settings
 */
declare class AutomixController {
    private conn;
    private store;
    /** Global response time (linear, between `0` and `1`) */
    responseTime$: rxjs.Observable<number>;
    /** Global response time in milliseconds (between `20` and `4000` ms) */
    responseTimeMs$: rxjs.Observable<number>;
    /**
     * Set global response time (linear)
     * @param value linear value between `0` and `1`
     */
    setResponseTime(value: number): void;
    /**
     * Set global response time (ms)
     * @param value milliseconds value between `20` and `4000`
     */
    setResponseTimeMs(timeMs: number): void;
    /** Access to automix groups `a` and `b` */
    groups: {
        [Id in AutomixGroupId]: AutomixGroup;
    };
    constructor(conn: MixerConnection, store: MixerStore);
}

declare enum Easings {
    Linear = 0,
    EaseIn = 1,
    EaseOut = 2,
    EaseInOut = 3
}

interface FadeableChannel {
    /** Name of the channel */
    name$: Observable<string>;
    faderLevel$: Observable<number>;
    faderLevelDB$: Observable<number>;
    fadeTo(targetValue: number, fadeTime: number, easing: Easings, fps?: number): Promise<void>;
    fadeToDB(targetValueDB: number, fadeTime: number, easing: Easings, fps?: number): Promise<void>;
    setFaderLevel(value: number): void;
    setFaderLevelDB(dbValue: number): void;
    changeFaderLevelDB(offsetDB: number): void;
}
interface PannableChannel {
    pan$: Observable<number>;
    setPan(value: number): void;
}

/**
 * Represents a single channel with a fader
 */
declare class Channel implements FadeableChannel {
    protected conn: MixerConnection;
    protected store: MixerStore;
    protected channelType: ChannelType;
    protected channel: number;
    protected busType: BusType;
    protected bus: number;
    fullChannelId: string;
    protected faderLevelCommand: string;
    protected linkedChannelIds: string[];
    private transitionSources$;
    /** Index of this channel in the stereolink compound (0 = I'm first, 1 = I'm second, -1 = not linked) */
    protected stereoIndex$: rxjs.Observable<number>;
    /** Linear level of the channel (between `0` and `1`) */
    faderLevel$: rxjs.Observable<number>;
    /** dB level of the channel (between `-Infinity` and `10`) */
    faderLevelDB$: rxjs.Observable<number>;
    /** MUTE value of the channel (`0` or `1`) */
    mute$: rxjs.Observable<number>;
    name$: rxjs.Observable<string>;
    constructor(conn: MixerConnection, store: MixerStore, channelType: ChannelType, channel: number, busType?: BusType, bus?: number);
    /**
     * Perform fader transition to linear value
     * @param targetValue Target value as linear value (between 0 and 1)
     * @param fadeTime Fade time in ms
     * @param easing Easing characteristic, as an entry of the `Easings` enum. Defaults to `Linear`
     * @param fps Frames per second, defaults to 25
     */
    fadeTo(targetValue: number, fadeTime: number, easing?: Easings, fps?: number): Promise<void>;
    /**
     * Perform fader transition to dB value
     * @param targetValueDB Target value as dB value (between -Infinity and 10)
     * @param fadeTime Fade time in ms
     * @param easing Easing characteristic, as an entry of the `Easings` enum. Defaults to `Linear`
     * @param fps Frames per second, defaults to 25
     */
    fadeToDB(targetValueDB: number, fadeTime: number, easing?: Easings, fps?: number): Promise<void>;
    /**
     * Set linear level of the channel fader
     * @param value value between `0` and `1`
     */
    setFaderLevel(value: number): void;
    private setFaderLevelRaw;
    /**
     * Set dB level of the channel fader
     * @param value value between `-Infinity` and `10`
     */
    setFaderLevelDB(dbValue: number): void;
    /**
     * Change the fader value relatively by adding a given value
     * @param offsetDB value (dB) to add to the current value
     */
    changeFaderLevelDB(offsetDB: number): void;
    /**
     * Set MUTE value for the channel
     * @param value MUTE value `0` or `1`
     */
    setMute(value: number): void;
    /** Enable MUTE for the channel */
    mute(): void;
    /** Disable MUTE for the channel */
    unmute(): void;
    /** Toggle MUTE status for the channel */
    toggleMute(): void;
    /** Set name of the channel */
    setName(name: string): void;
}

/**
 * Represents a channel on a send bus (AUX or FX).
 * Used as super class for Aux and Fx
 */
declare class SendChannel extends Channel {
    protected constructChannelId(channelType: ChannelType, channel: number, busType: BusType, bus: number): string;
    fullChannelId: string;
    faderLevelCommand: string;
    /** PRE/POST value of the channel (`1` (POST) or `0` (PRE)) */
    post$: rxjs.Observable<number>;
    constructor(conn: MixerConnection, store: MixerStore, channelType: ChannelType, channel: number, busType: BusType, bus: number);
    /**
     * Set PRE/POST value for the channel
     * @param value `1` (POST) or `0` (PRE)
     */
    setPost(value: number): void;
    /** Set AUX channel to POST */
    post(): void;
    /** Set AUX channel to PRE */
    pre(): void;
    /** Toggle PRE/POST status of the channel */
    togglePost(): void;
}

/**
 * Represents a channel on an AUX bus
 */
declare class AuxChannel extends SendChannel implements PannableChannel {
    /** when the AUX bus is stereo-linked, this contains the ID of this channel on the linked bus */
    private auxLinkChannelIds;
    /** PAN value of the AUX channel (between `0` and `1`) */
    pan$: rxjs.Observable<number>;
    constructor(conn: MixerConnection, store: MixerStore, channelType: ChannelType, channel: number, bus: number);
    /**
     * Set PAN value of the AUX channel.
     * This only works for stereo-linked AUX buses, not for mono AUX.
     * @param value value between `0` and `1`
     */
    setPan(value: number): void;
    /**
     * Relatively change PAN value of the AUX channel.
     * This only works for stereo-linked AUX buses, not for mono AUX.
     * @param offset offset to change (final values are between `0` and `1`)
     */
    changePan(offset: number): void;
    /**
     * Set PRE/POST PROC value for the AUX channel
     * @param value `1` (POST PROC) or `0` (PRE PROC)
     */
    setPostProc(value: number): void;
    /** Set AUX channel to POST PROC */
    postProc(): void;
    /** Set AUX channel to PRE PROC */
    preProc(): void;
}

/**
 * Represents an AUX bus
 */
declare class AuxBus {
    private conn;
    private store;
    private bus;
    constructor(conn: MixerConnection, store: MixerStore, bus: number);
    /**
     * Get input channel on the AUX bus
     * @param channel Channel number
     */
    input(channel: number): AuxChannel;
    /**
     * Get line channel on the AUX bus
     * @param channel Channel number
     */
    line(channel: number): AuxChannel;
    /**
     * Get player channel on the AUX bus
     * @param channel Channel number
     */
    player(channel: number): AuxChannel;
    /**
     * Get FX channel on the AUX bus
     * @param channel Channel number
     */
    fx(channel: number): AuxChannel;
}

declare class DeviceInfo {
    private store;
    /**
     * Hardware model of the mixer.
     * Possible values: `ui12`, `ui16`, `ui24`
     */
    model$: rxjs.Observable<MixerModel>;
    /** Firmware version of ther mixer */
    firmware$: rxjs.Observable<string>;
    /**
     * Hardware model of the mixer.
     * Possible values: `ui12`, `ui16`, `ui24`
     */
    model?: MixerModel;
    constructor(store: MixerStore);
}

/**
 * Represents the 2-track recorder in the media player
 */
declare class DualTrackRecorder {
    private conn;
    private store;
    /** Recording state (`0` or `1`) */
    recording$: rxjs.Observable<number>;
    /** Recording busy state (`0` or `1`) */
    busy$: rxjs.Observable<number>;
    constructor(conn: MixerConnection, store: MixerStore);
    /** Toggle recording */
    recordToggle(): void;
    /** Start recording */
    recordStart(): void;
    /** Stop recording */
    recordStop(): void;
}

/**
 * Represents a channel on an FX bus
 */
declare class FxChannel extends SendChannel {
    constructor(conn: MixerConnection, store: MixerStore, channelType: ChannelType, channel: number, bus: number);
}

/**
 * Represents an FX bus
 */
declare class FxBus {
    private conn;
    private store;
    private bus;
    /**
     * Selected FX type (Reverb, Delay, Chorus, Room).
     * The numeric value can be matched using the `FxType` enum.
     */
    fxType$: Observable<FxType>;
    /**
     * BPM value of this FX.
     * This setting is always present but might not be actually used if the selected FX does not have a BPM setting.
     */
    bpm$: Observable<number>;
    constructor(conn: MixerConnection, store: MixerStore, bus: number);
    /**
     * Get input channel on the FX bus
     * @param channel Channel number
     */
    input(channel: number): FxChannel;
    /**
     * Get line channel on the FX bus
     * @param channel Channel number
     */
    line(channel: number): FxChannel;
    /**
     * Get player channel on the FX bus
     * @param channel Channel number
     */
    player(channel: number): FxChannel;
    /**
     * Get sub group channel on the FX bus
     * @param channel Channel number
     */
    sub(channel: number): FxChannel;
    /**
     * Set BPM value of this FX (between `20` and `400`)
     * This setting is always present but might not be actually used if the selected FX does not have a BPM setting.
     */
    setBpm(value: number): void;
    private assertFxParamInRange;
    private makeFxParamPath;
    /**
     * Get linear values (between `0` and `1`) of one FX parameter as an Observable stream
     * @param param FX Parameter, between `1` and `6`
     * @returns Observable<number>
     */
    getParam(param: number): Observable<number>;
    /**
     * Set linear value for one FX parameter
     * @param param FX Parameter, between `1` and `6`
     * @param value value to set, between `0` and `1`
     * @returns Observable<number>
     */
    setParam(param: number, value: number): void;
}

/**
 * Represents a hardware input on the mixer
 */
declare class HwChannel {
    protected conn: MixerConnection;
    protected store: MixerStore;
    protected deviceInfo: DeviceInfo;
    protected channel: number;
    fullChannelId: string;
    /** Phantom power state of the channel (`0` or `1`) */
    phantom$: rxjs.Observable<number>;
    /** Linear gain level of the channel (between `0` and `1`) */
    gain$: rxjs.Observable<number>;
    /** dB gain level of the channel */
    gainDB$: rxjs.Observable<number>;
    constructor(conn: MixerConnection, store: MixerStore, deviceInfo: DeviceInfo, channel: number);
    /**
     * Set phantom power state for the channel
     * @param value `0` or `1`
     */
    setPhantom(value: number): void;
    /** Switch ON phantom power for the channel */
    phantomOn(): void;
    /** Switch OFF phantom power for the channel */
    phantomOff(): void;
    /** Toggle phantom power for the channel */
    togglePhantom(): void;
    /**
     * Set gain level (linear) for the channel
     * @param value value between `0` and `1`
     */
    setGain(value: number): void;
    /**
     * Set gain level (dB) for the channel
     * @param value value between `-6` and `57`
     */
    setGainDB(dbValue: number): void;
    /**
     * Change the gain value relatively by adding a given value
     * @param offsetDB value (dB) to add to the current value
     */
    changeGainDB(offsetDB: number): void;
}

/**
 * Represents a channel on the master bus
 */
declare class MasterChannel extends Channel implements PannableChannel {
    private constructChannelId;
    fullChannelId: string;
    faderLevelCommand: string;
    /** SOLO value of the channel (`0` or `1`) */
    solo$: rxjs.Observable<number>;
    /** PAN value of the channel (between `0` and `1`) */
    pan$: rxjs.Observable<number>;
    /** Assigned automix group (`a`, `b`, `none`) */
    automixGroup$: rxjs.Observable<AutomixGroupId | "none">;
    /** Automix weight (linear) for this channel (between `0` and `1`) */
    automixWeight$: rxjs.Observable<number>;
    /** Automix weight (dB) for this channel (between `-12` and `12` dB) */
    automixWeightDB$: rxjs.Observable<number>;
    /** Multitrack selection state for the channel (`0` or `1`) */
    multiTrackSelected$: rxjs.Observable<number>;
    constructor(conn: MixerConnection, store: MixerStore, channelType: ChannelType, channel: number);
    /**
     * Set PAN value of the channel
     * @param value value between `0` and `1`
     */
    setPan(value: number): void;
    /**
     * Relatively change PAN value of the channel
     * @param offset offset to change (final values are between `0` and `1`)
     */
    changePan(offset: number): void;
    /**
     * Set SOLO value for the channel
     * @param value SOLO value `0` or `1`
     */
    setSolo(value: number): void;
    /** Enable SOLO for the channel */
    solo(): void;
    /** Disable SOLO for the channel */
    unsolo(): void;
    /** Toggle SOLO status for the channel */
    toggleSolo(): void;
    private multiTrackAssertChannelType;
    private multiTrackSetSelection;
    /** Select this channel for multitrack recording */
    multiTrackSelect(): void;
    /** Remove this channel from multitrack recording */
    multiTrackUnselect(): void;
    /** Toggle multitrack recording for this channel */
    multiTrackToggle(): void;
    /** Assign this channel to an automix group. This also includes stereo-linked channels.
     * @param group `a` or `b` for automix groups. `none` to remove from all groups.
     */
    automixAssignGroup(group: AutomixGroupId | 'none'): void;
    /** Remove this channel from the automix group */
    automixRemove(): void;
    /**
     * Set automix weight (linear) for the channel
     * @param value value between `0` and `1`
     */
    automixSetWeight(value: number): void;
    /**
     * Set automix weight (dB) for the channel
     * @param value value between `-12` and `12`
     */
    automixSetWeightDB(dbValue: number): void;
    /**
     * Change the automix weight relatively by adding a given value
     * @param offsetDB value (dB) to add to the current value
     */
    automixChangeWeightDB(offsetDB: number): void;
}

/**
 * Represents a channel on the master bus that can be delayed (input, line and aux)
 */
declare class DelayableMasterChannel extends MasterChannel {
    /** Delay value of the channel (between `0` and `500` ms) */
    delay$: rxjs.Observable<number>;
    /** default delay value (ms) for input channels */
    private delayMaxValueMs;
    constructor(conn: MixerConnection, store: MixerStore, channelType: ChannelType, channel: number);
    /**
     * Set delay of the channel in millseconds.
     * Input channels allow a maximum of 250 ms, AUX master channels can be delayed by 500 ms.
     * @param ms delay in milliseconds
     */
    setDelay(ms: number): void;
    /**
     * Change the delay relatively by adding a value.
     * Input channels allow a maximum of 250 ms, AUX master channels can be delayed by 500 ms.
     * @param offsetMs value (ms) to add to the current value
     */
    changeDelay(offsetMs: number): void;
}

/**
 * Represents the master bus
 */
declare class MasterBus implements FadeableChannel, PannableChannel {
    private conn;
    private store;
    name$: rxjs.Observable<string>;
    /** Linear level of the master fader (between `0` and `1`) */
    faderLevel$: rxjs.Observable<number>;
    /** dB level of the master fader (between `-Infinity` and `10`) */
    faderLevelDB$: rxjs.Observable<number>;
    /** PAN value of the master (between `0` and `1`) */
    pan$: rxjs.Observable<number>;
    /** DIM value of the master (`0` or `1`) */
    dim$: rxjs.Observable<number>;
    /** LEFT DELAY (ms) of the master */
    delayL$: rxjs.Observable<number>;
    /** RIGHT DELAY (ms) of the master */
    delayR$: rxjs.Observable<number>;
    private transitionSources$;
    constructor(conn: MixerConnection, store: MixerStore);
    /** Fader getters */
    /**
     * Get input channel on the master bus
     * @param channel Channel number
     */
    input(channel: number): DelayableMasterChannel;
    /**
     * Get line channel on the master bus
     * @param channel Channel number
     */
    line(channel: number): DelayableMasterChannel;
    /**
     * Get player channel on the master bus
     * @param channel Channel number
     */
    player(channel: number): MasterChannel;
    /**
     * Get AUX output channel on the master bus
     * @param channel Channel number
     */
    aux(channel: number): DelayableMasterChannel;
    /**
     * Get FX channel on the master bus
     * @param channel Channel number
     */
    fx(channel: number): MasterChannel;
    /**
     * Get sub group channel on the master bus
     * @param channel Channel number
     */
    sub(channel: number): MasterChannel;
    /**
     * Get VCA channel on the master bus
     * @param channel Channel number
     */
    vca(channel: number): MasterChannel;
    /** Master actions */
    /**
     * Perform fader transition to linear value
     * @param targetValue Target value as linear value (between 0 and 1)
     * @param fadeTime Fade time in ms
     * @param easing Easing characteristic, as an entry of the `Easings` enum. Defaults to `Linear`
     * @param fps Frames per second, defaults to 25
     */
    fadeTo(targetValue: number, fadeTime: number, easing?: Easings, fps?: number): Promise<void>;
    /**
     * Perform fader transition to dB value
     * @param targetValueDB Target value as dB value (between -Infinity and 10)
     * @param fadeTime Fade time in ms
     * @param easing Easing characteristic, as an entry of the `Easings` enum. Defaults to `Linear`
     * @param fps Frames per second, defaults to 25
     */
    fadeToDB(targetValueDB: number, fadeTime: number, easing?: Easings, fps?: number): Promise<void>;
    /**
     * Set linear level of the master fader
     * @param value value between `0` and `1`
     */
    setFaderLevel(value: number): void;
    private setFaderLevelRaw;
    /**
     * Set dB level of the master fader
     * @param dbValue value between `-Infinity` and `10`
     */
    setFaderLevelDB(dbValue: number): void;
    /**
     * Change the fader value relatively by adding a given value
     * @param offsetDB value (dB) to add to the current value
     */
    changeFaderLevelDB(offsetDB: number): void;
    /**
     * Set PAN value for the master
     * @param value value between `0` and `1`
     */
    setPan(value: number): void;
    /**
     * Relatively change PAN value for the master
     * @param offset offset to change (final values are between `0` and `1`)
     */
    changePan(offset: number): void;
    /**
     * Set DIM value for the master
     * @param value DIM value `0` or `1`
     */
    setDim(value: number): void;
    /** Enable DIM on the master */
    dim(): void;
    /** Disable DIM on the master */
    undim(): void;
    /** Toggle DIM on the master */
    toggleDim(): void;
    /** Set LEFT DELAY (ms) for master output. Maximum 500 ms */
    setDelayL(ms: number): void;
    /** Set RIGHT DELAY (ms) for master output. Maximum 500 ms */
    setDelayR(ms: number): void;
    /**
     * Relatively change LEFT DELAY (ms) for master output. Maximum 500 ms
     * @param offsetMs value (ms) to add to the current value
     */
    changeDelayL(offsetMs: number): void;
    /**
     * Relatively change RIGHT DELAY (ms) for master output. Maximum 500 ms
     * @param offsetMs value (ms) to add to the current value
     */
    changeDelayR(offsetMs: number): void;
    private setDelay;
}

/**
 * Represents the multi track recorder (Ui24R only)
 */
declare class MultiTrackRecorder {
    private conn;
    private store;
    /** Current state (playing, stopped, paused) */
    state$: rxjs.Observable<MtkState>;
    /** Current session name (e.g. `0001` or individual name) */
    session$: rxjs.Observable<string>;
    /** Current session length in seconds */
    length$: rxjs.Observable<number>;
    /** Elapsed time of current session in seconds */
    elapsedTime$: rxjs.Observable<number>;
    /** Remaining time of current session in seconds */
    remainingTime$: rxjs.Observable<number>;
    /** Recording state (`0` or `1`) */
    recording$: rxjs.Observable<number>;
    /** Recording busy state (`0` or `1`) */
    busy$: rxjs.Observable<number>;
    /** Recording time in seconds */
    recordingTime$: rxjs.Observable<number>;
    /** Soundcheck activation state (`0` or `1`) */
    soundcheck$: rxjs.Observable<number>;
    constructor(conn: MixerConnection, store: MixerStore);
    /** Start the player */
    play(): void;
    /** Pause the player */
    pause(): void;
    /** Stop the player */
    stop(): void;
    /** Toggle recording */
    recordToggle(): void;
    /** Start recording */
    recordStart(): void;
    /** Stop recording */
    recordStop(): void;
    /**
     * Set soundcheck (activate or deactivate)
     * @param value `0` or `1`
     */
    setSoundcheck(value: number): void;
    /** Activate soundcheck */
    activateSoundcheck(): void;
    /** Deactivate soundcheck */
    deactivateSoundcheck(): void;
    /** Toggle soundcheck */
    toggleSoundcheck(): void;
}

type MuteGroupID = number | 'all' | 'fx';
/**
 * Represents a MUTE group and related mute groupings like "MUTE ALL" and "MUTE FX"
 */
declare class MuteGroup {
    private conn;
    private store;
    readonly id: MuteGroupID;
    private groupIndex;
    constructor(conn: MixerConnection, store: MixerStore, id: MuteGroupID);
    private mgMask$;
    /** MUTE state of the group (`0` or `1`) */
    state$: rxjs.Observable<number>;
    /** Mute the MUTE group */
    mute(): void;
    /** Unmute the MUTE group */
    unmute(): void;
    /** Toggle the MUTE group */
    toggle(): void;
    private setMgMask;
}

/**
 * Represents the media player
 */
declare class Player {
    private conn;
    private store;
    /** Current state (playing, stopped, paused) */
    state$: rxjs.Observable<PlayerState>;
    /** Current playlist name */
    playlist$: rxjs.Observable<string>;
    /** Current track name */
    track$: rxjs.Observable<string>;
    /** Current track length in seconds */
    length$: rxjs.Observable<number>;
    /** Elapsed time of current track in seconds */
    elapsedTime$: rxjs.Observable<number>;
    /** Remaining time of current track in seconds */
    remainingTime$: rxjs.Observable<number>;
    /** Shuffle setting (`0` or `1`) */
    shuffle$: rxjs.Observable<number>;
    constructor(conn: MixerConnection, store: MixerStore);
    /** Start the media player */
    play(): void;
    /** Pause the media player */
    pause(): void;
    /** Stop the media player */
    stop(): void;
    /** Jump to next track */
    next(): void;
    /** Jump to previous track */
    prev(): void;
    /**
     * Load a playlist by name
     * @param playlist Playlist name
     */
    loadPlaylist(playlist: string): void;
    /**
     * Load a track from a given playlist
     * @param playlist Playlist name
     * @param track Track name on the playlist
     */
    loadTrack(playlist: string, track: string): void;
    /**
     * Set player shuffle setting
     * @param value `0` or `1`
     */
    setShuffle(value: number): void;
    /**
     * Toggle player shuffle setting
     */
    toggleShuffle(): void;
    /**
     * Set player mode like `manual` or `auto`.
     * Values are rather internal, please use convenience functions `manual()` and `auto()`.
     * @param value
     */
    setPlayMode(value: number): void;
    /** Enable manual mode */
    setManual(): void;
    /** Enable automatic mode */
    setAuto(): void;
}

/**
 * Controller for Shows, Snapshots and Cues
 */
declare class ShowController {
    private conn;
    private store;
    /** Currently loaded show */
    currentShow$: rxjs.Observable<string>;
    /** Currently loaded snapshot */
    currentSnapshot$: rxjs.Observable<string>;
    /** Currently loaded cue */
    currentCue$: rxjs.Observable<string>;
    constructor(conn: MixerConnection, store: MixerStore);
    /**
     * Load a show by name
     * @param show Show name
     */
    loadShow(show: string): void;
    /**
     * Load a snapshot in a show
     * @param show Show name
     * @param snapshot Snapshot name in the show
     */
    loadSnapshot(show: string, snapshot: string): void;
    /**
     * Load a cue in a show
     * @param show Show name
     * @param cue Cue name in the show
     */
    loadCue(show: string, cue: string): void;
    /**
     * Save a snapshot in a show. This will overwrite an existing snapshot.
     * @param show Show name
     * @param snapshot Snapshot name in the show
     */
    saveSnapshot(show: string, snapshot: string): void;
    /**
     * Save a cue in a show. This will overwrite an existing cue.
     * @param show Show name
     * @param cue Cue name in the show
     */
    saveCue(show: string, cue: string): void;
    /** Update and overwrite the currently loaded snapshot */
    updateCurrentSnapshot(): void;
    /** Update and overwrite the currently loaded cue */
    updateCurrentCue(): void;
}

/**
 * Represents a volume bus like headphones or solo
 */
declare class VolumeBus implements FadeableChannel {
    protected conn: MixerConnection;
    protected store: MixerStore;
    protected busName: VolumeBusType;
    protected busId?: number | undefined;
    private transitionSources$;
    /** Linear level of the volume bus (between `0` and `1`) */
    faderLevel$: rxjs.Observable<number>;
    /** dB level of the volume bus (between `-Infinity` and `10`) */
    faderLevelDB$: rxjs.Observable<number>;
    name$: rxjs.Observable<string>;
    constructor(conn: MixerConnection, store: MixerStore, busName: VolumeBusType, busId?: number | undefined);
    /**
     * Perform fader transition to linear value
     * @param targetValue Target value as linear value (between 0 and 1)
     * @param fadeTime Fade time in ms
     * @param easing Easing characteristic, as an entry of the `Easings` enum. Defaults to `Linear`
     * @param fps Frames per second, defaults to 25
     */
    fadeTo(targetValue: number, fadeTime: number, easing?: Easings, fps?: number): Promise<void>;
    /**
     * Perform fader transition to dB value
     * @param targetValueDB Target value as dB value (between -Infinity and 10)
     * @param fadeTime Fade time in ms
     * @param easing Easing characteristic, as an entry of the `Easings` enum. Defaults to `Linear`
     * @param fps Frames per second, defaults to 25
     */
    fadeToDB(targetValueDB: number, fadeTime: number, easing?: Easings, fps?: number): Promise<void>;
    /**
     * Set linear level of the bus volume
     * @param value value between `0` and `1`
     */
    setFaderLevel(value: number): void;
    private setFaderLevelRaw;
    /**
     * Set dB level of the bus volume
     * @param value value between `-Infinity` and `10`
     */
    setFaderLevelDB(dbValue: number): void;
    /**
     * Change the volume fader value relatively by adding a given value
     * @param offsetDB value (dB) to add to the current value
     */
    changeFaderLevelDB(offsetDB: number): void;
}

interface StereoVuData {
    vuPostL: number;
    vuPostR: number;
    vuPostFaderL: number;
    vuPostFaderR: number;
}
interface InputChannelVuData {
    vuPre: number;
    vuPost: number;
    vuPostFader: number;
}
interface AuxChannelVuData {
    vuPost: number;
    vuPostFader: number;
}
interface MasterVuData {
    vuPost: number;
    vuPostFader: number;
}
type FxVuData = StereoVuData;
type SubGroupVuData = StereoVuData;
type StereoMasterVuData = SubGroupVuData;
interface VuData {
    input: InputChannelVuData[];
    player: InputChannelVuData[];
    sub: SubGroupVuData[];
    fx: FxVuData[];
    aux: AuxChannelVuData[];
    master: MasterVuData[];
    line: InputChannelVuData[];
}

declare class VuProcessor {
    private conn;
    /** VU data for all master channels */
    vuData$: Observable<VuData>;
    constructor(conn: MixerConnection);
    /**
     * Get VU info for input channel on the master bus
     * @param channel Channel number
     */
    input(channel: number): Observable<InputChannelVuData>;
    /**
     * Get VU info for line channel on the master bus
     * @param channel Channel number
     */
    line(channel: number): Observable<InputChannelVuData>;
    /**
     * Get VU info for player channel on the master bus
     * @param channel Channel number
     */
    player(channel: number): Observable<InputChannelVuData>;
    /**
     * Get VU info for AUX output channel on the master bus
     * @param channel Channel number
     */
    aux(channel: number): Observable<AuxChannelVuData>;
    /**
     * Get VU info for FX channel on the master bus
     * @param channel Channel number
     */
    fx(channel: number): Observable<FxVuData>;
    /**
     * Get VU info for sub group channel on the master bus
     * @param channel Channel number
     */
    sub(channel: number): Observable<SubGroupVuData>;
    /**
     * Get VU info for the stereo grand master
     */
    master(): Observable<StereoMasterVuData>;
}

declare class ChannelSync {
    private sui;
    private readonly defaultSyncId;
    constructor(sui: SoundcraftUI);
    /**
     * Get index of the currently selected channel as an Observable stream, from left to right on the master bus.
     * @param syncId SYNC ID to use (default: 'SYNC_ID')
     * @returns
     */
    getSelectedChannelIndex(syncId?: string): Observable<number>;
    /**
     * Get the currently selected channel object on the master bus as an Observable stream.
     * It emits `FadeableChannel` objects. Note that this interface does not contain all fields of a channel but only the subset that all fadeable objects share.
     * @param syncId SYNC ID to use (default: 'SYNC_ID')
     * @returns
     */
    getSelectedChannel(syncId?: string): Observable<FadeableChannel | null>;
    /**
     * Select a channel by index. All clients with the same SYNC ID will select the same channel.
     * @param index Zero-based index of the channel to select, from left to right on the master bus
     * @param syncId SYNC ID to use (default: 'SYNC_ID')
     */
    selectChannelIndex(index: number, syncId?: string): void;
    /**
     * Select a channel by type and number. All clients with the same SYNC ID will select the same channel.
     * @param type Channel type (`i`, `l`, `p`, `f`, `s`, `a`, `v`, `master`)
     * @param num Channel number
     * @param syncId SYNC ID to use (default: 'SYNC_ID')
     *
     * @example
     * ```ts
     * // Select input 1
     * selectChannel('i', 1)
     *
     * // Select input 1 with SYNC ID 'mySyncId'
     * selectChannel('i', 1, 'mySyncId')
     *
     * // Select master
     * selectChannel('master')
     *
     * // Select master with SYNC ID 'mySyncId'
     * selectChannel('master', 'mySyncId')
     * ```
     */
    selectChannel(type: 'master', syncId?: string): void;
    selectChannel(type: ChannelType, num: number, syncId?: string): void;
}

declare class SoundcraftUI {
    private _options;
    /**
     * Get mixer options as a read-only copy.
     * Options can only be set once at initialization and cannot be changed later.
     */
    get options(): Readonly<SoundcraftUIOptions>;
    readonly conn: MixerConnection;
    readonly store: MixerStore;
    /** Information about hardware and software of the mixer */
    readonly deviceInfo: DeviceInfo;
    /** Connection status */
    readonly status$: Observable<ConnectionEvent>;
    /** VU meter information for master channels */
    readonly vuProcessor: VuProcessor;
    /** Master bus */
    readonly master: MasterBus;
    /** Media player */
    readonly player: Player;
    /** 2-track recorder */
    readonly recorderDualTrack: DualTrackRecorder;
    /** multitrack recorder */
    readonly recorderMultiTrack: MultiTrackRecorder;
    /** SOLO and Headphone buses */
    readonly volume: {
        solo: VolumeBus;
        headphone: (id: number) => VolumeBus;
    };
    /** Show controller (Shows, Snapshots, Cues) */
    readonly shows: ShowController;
    /** Automix controller */
    readonly automix: AutomixController;
    /** Channel Sync Controller */
    readonly channelSync: ChannelSync;
    /**
     * Create a new instance to connect to a Soundcraft Ui mixer.
     * The IP address of the mixer is a required parameter.
     * You can either pass it in directly or as part of an options object:
     *
     * ```ts
     * new SoundcraftUI('192.168.1.123');
     * new SoundcraftUI({ targetIP: '192.168.1.123' });
     * ```
     */
    constructor(options: SoundcraftUIOptions);
    constructor(targetIP: string);
    /**
     * Get AUX bus
     * @param bus Bus number
     */
    aux(bus: number): AuxBus;
    /**
     * Get FX bus
     * @param bus Bus number
     */
    fx(bus: number): FxBus;
    /**
     * Get MUTE group or related groupings (MUTE ALL and MUTE FX)
     * @param id ID of the group: `1`..`6`, `all`, `fx`
     */
    muteGroup(id: MuteGroupID): MuteGroup;
    /** Unmute all mute groups, "MUTE ALL" and "MUTE FX" */
    clearMuteGroups(): void;
    /**
     * Get hardware channel. With 1:1 patching, those are the same as input channels.
     * However, if patched differently, HW channel 1 still is the first input on the hardware.
     *
     * @param channel Channel number
     */
    hw(channel: number): HwChannel;
    /** Connect to the mixer. Returns a Promise that resolves when the connection is open and the initial params have likely been received by the mixer. */
    connect(): Promise<void>;
    /** Disconnect from the mixer. Returns a Promise that resolves when the connection is closed. */
    disconnect(): Promise<void>;
    /**
     * Reconnect to the mixer after 1 second.
     * Returns a Promise that resolves when the connection is open again and the initial params have likely been received by the mixer.
     */
    reconnect(): Promise<void>;
}

/** Asserts that the given object is an instance of `Channel` */
declare function isChannel(ch: unknown): ch is Channel;
/** Asserts that the given object is an instance of `MasterChannel` */
declare function isMasterChannel(ch: unknown): ch is MasterChannel;
/** Asserts that the given object is an instance of `DelayableMasterChannel` */
declare function isDelayableMasterChannel(ch: unknown): ch is DelayableMasterChannel;
/** Asserts that the given object is an instance of `MasterBus` */
declare function isMaster(ch: unknown): ch is MasterBus;

/** Clamp numeric value to min and max */
declare function clamp(value: number, min: number, max: number): number;
/** Round a number to three decimal places */
declare function roundToThreeDecimals(value: number): number;
/**
 * Transform a given value to int, float or string
 * @param value
 */
declare function transformStringValue(value: string): string | number;
/**
 * Transform player time in seconds to human-readable format M:SS
 * @param value player time in seconds
 */
declare function playerTimeToString(value: number): string;
declare function getLinkedChannelNumber(channel: number, stereoIndex: number): number;
/** Helper function to convert FX type into readable name (Reverb, Chorus, ...) */
declare function fxTypeToString(type: FxType): keyof typeof FxType;
/**
 * Construct a human-readable name for a channel
 * based on the default labels from the web interface
 * @param type
 * @param channel
 * @returns
 */
declare function constructReadableChannelName(type: ChannelType | VolumeBusType, channel: number): string;
/**
 * Returns a Promise that fires when the mixer state hasn't changed for 25 ms OR when 250 ms timeout are over.
 * This makes sure that all initial params can be received by the mixer after connection init.
 * In case the state never stands still for 50 ms, the 250 ms timeout will emit finally.
 */
declare function waitForInitParams(store: MixerStore): Promise<void>;

/**
 * Convert fader value from dB to linear float value between 0 and 1
 * @param value fader value in dB
 */
declare function DBToFaderValue(dbValue: number): number;
/**
 * Convert fader value from linear float value (between 0 and 1) to dB value
 * @param value linear fader value
 */
declare function faderValueToDB(value: number): number;

/** convert linear VU value (between `0`..`1`) to dB (between `-80`..`0`)
 *
 * ```ts
 * // Example
 * conn.vuProcessor.master().pipe(
 *   map(data => vuValueToDB(data.vuPostFaderL))
 * );
 * ```
 */
declare function vuValueToDB(linearValue: number): number;

export { AutomixController, AutomixGroup, type AutomixGroupId, AuxBus, AuxChannel, type AuxChannelVuData, type BusType, Channel, ChannelSync, type ChannelType, type ConnectionErrorEvent, type ConnectionEvent, ConnectionStatus, type ConnectionStatusEvent, DBToFaderValue, DelayableMasterChannel, DeviceInfo, DualTrackRecorder, Easings, type FadeableChannel, FxBus, FxChannel, FxType, type FxVuData, HwChannel, type InputChannelVuData, MasterBus, MasterChannel, type MasterVuData, type MixerModel, MtkState, MultiTrackRecorder, MuteGroup, type MuteGroupID, type PannableChannel, Player, PlayerState, SendChannel, ShowController, SoundcraftUI, type SoundcraftUIOptions, type StereoMasterVuData, type StereoVuData, type SubGroupVuData, VolumeBus, type VolumeBusType, type VuData, VuProcessor, clamp, constructReadableChannelName, faderValueToDB, fxTypeToString, getLinkedChannelNumber, isChannel, isDelayableMasterChannel, isMaster, isMasterChannel, playerTimeToString, roundToThreeDecimals, transformStringValue, vuValueToDB, waitForInitParams };
