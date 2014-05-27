'use strict';

if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(function(require) {

    var chai = require('chai');
    var sinon = require('sinon');
    var BrowserBox = require('browserbox');
    var mimeTorture = require('./fixtures/mime-torture-bodystructure');
    var testEnvelope = require('./fixtures/envelope');

    var expect = chai.expect;
    chai.Assertion.includeStack = true;

    describe('browserbox unit tests', function() {
        var br;

        beforeEach(function() {
            br = new BrowserBox();
            br.client.socket = {
                send: function() {}
            };
        });

        /* jshint indent:false */

        describe('#_onClose', function() {
            it('should emit onclose', function() {
                sinon.stub(br, 'onclose');

                br._onClose();

                expect(br.onclose.callCount).to.equal(1);

                br.onclose.restore();
            });
        });

        describe('#_onTimeout', function() {
            it('should emit onerror and call destroy', function() {
                br.onerror = function() {}; // not defined by default
                sinon.stub(br, 'onerror');
                sinon.stub(br.client, '_destroy');

                br._onTimeout();

                expect(br.onerror.callCount).to.equal(1);
                expect(br.client._destroy.callCount).to.equal(1);

                br.onerror.restore();
                br.client._destroy.restore();
            });
        });

        describe('#_onReady', function() {
            it('should call updateCapability', function() {
                sinon.stub(br, 'updateCapability');

                br._onReady();

                expect(br.updateCapability.callCount).to.equal(1);
                expect(br.state).to.equal(br.STATE_NOT_AUTHENTICATED);

                br.updateCapability.restore();
            });
        });

        describe('#_onIdle', function() {
            it('should call enterIdle', function() {
                sinon.stub(br, 'enterIdle');

                br.authenticated = true;
                br._enteredIdle = false;
                br._onIdle();

                expect(br.enterIdle.callCount).to.equal(1);

                br.enterIdle.restore();
            });

            it('should not call enterIdle', function() {
                sinon.stub(br, 'enterIdle');

                br._enteredIdle = true;
                br._onIdle();

                expect(br.enterIdle.callCount).to.equal(0);

                br.enterIdle.restore();
            });
        });

        describe('#connect', function() {
            it('should initiate tcp connection', function() {
                sinon.stub(br.client, 'connect');

                br.connect();

                expect(br.client.connect.callCount).to.equal(1);

                clearTimeout(br._connectionTimeout);
                br.client.connect.restore();
            });

            it('should timeout if connection is not created', function(done) {
                sinon.stub(br.client, 'connect');
                sinon.stub(br, '_onTimeout', function() {

                    expect(br.client.connect.callCount).to.equal(1);

                    br.client.connect.restore();
                    br._onTimeout.restore();

                    done();
                });

                br.TIMEOUT_CONNECTION = 1;
                br.connect();
            });
        });

        describe('#close', function() {
            it('should send LOGOUT', function(done) {
                sinon.stub(br, 'exec', function(cmd, callback) {
                    expect(cmd).to.equal('LOGOUT');
                    callback();
                });

                br.close(function() {
                    expect(br.state).to.equal(br.STATE_LOGOUT);

                    br.exec.restore();
                    done();
                });
            });
        });

        describe('#exec', function() {
            beforeEach(function() {
                sinon.stub(br, 'breakIdle', function(callback) {
                    return callback();
                });
            });

            afterEach(function() {
                br.client.exec.restore();
                br.breakIdle.restore();
            });

            it('should send string command', function(done) {
                sinon.stub(br.client, 'exec', function() {
                    arguments[arguments.length - 1]({}, done);
                });
                br.exec('TEST', function(err, response, next) {
                    expect(br.client.exec.args[0][0]).to.equal('TEST');
                    next();
                });
            });

            it('should update capability from response', function(done) {
                sinon.stub(br.client, 'exec', function() {
                    arguments[arguments.length - 1]({
                        capability: ['A', 'B']
                    }, done);
                });
                br.exec('TEST', function(err, response, next) {
                    expect(err).to.not.exist;
                    expect(br.capability).to.deep.equal(['A', 'B']);
                    next();
                });
            });

            it('should return error on NO/BAD', function(done) {
                sinon.stub(br.client, 'exec', function() {
                    arguments[arguments.length - 1]({
                        command: 'NO'
                    }, done);
                });
                br.exec('TEST', function(err, response, next) {
                    expect(err).to.exist;
                    next();
                });
            });

            it('should continue with no callback', function(done) {
                sinon.stub(br.client, 'exec', function() {
                    arguments[arguments.length - 1]({}, done);
                });
                br.exec('TEST');
                expect(br.client.exec.callCount).to.equal(1);
            });
        });

        describe('#enterIdle', function() {
            it('should periodically send NOOP if IDLE not supported', function(done) {
                sinon.stub(br, 'exec', function(command) {
                    expect(command).to.equal('NOOP');

                    br.exec.restore();
                    done();
                });

                br.capability = [];
                br.TIMEOUT_NOOP = 1;
                br.enterIdle();
            });

            it('should break IDLE after timeout', function(done) {
                sinon.stub(br.client, 'exec');
                sinon.stub(br.client.socket, 'send', function(payload) {

                    expect(br.client.exec.args[0][0].command).to.equal('IDLE');
                    expect([].slice.call(new Uint8Array(payload))).to.deep.equal([0x44, 0x4f, 0x4e, 0x45, 0x0d, 0x0a]);

                    br.client.socket.send.restore();
                    br.client.exec.restore();
                    done();
                });

                br.capability = ['IDLE'];
                br.TIMEOUT_IDLE = 1;
                br.enterIdle();
            });
        });

        describe('#breakIdle', function() {
            it('should send DONE to socket', function(done) {
                sinon.stub(br.client.socket, 'send');

                br._enteredIdle = 'IDLE';
                br.breakIdle(function() {

                    expect([].slice.call(new Uint8Array(br.client.socket.send.args[0][0]))).to.deep.equal([0x44, 0x4f, 0x4e, 0x45, 0x0d, 0x0a]);
                    br.client.socket.send.restore();

                    done();
                });
            });
        });

        describe('#updateCapability', function() {
            it('should do nothing if capability is set', function() {
                br.capability = ['abc'];
                br.updateCapability(function(err, updated) {
                    expect(err).to.not.exist;
                    expect(updated).to.be.false;
                });
            });

            it('should run CAPABILITY if capability not set', function() {
                sinon.stub(br, 'exec');

                br.capability = [];
                br.updateCapability();
                expect(br.exec.args[0][0]).to.equal('CAPABILITY');

                br.exec.restore();
            });

            it('should force run CAPABILITY', function() {
                sinon.stub(br, 'exec');

                br.capability = ['abc'];
                br.updateCapability(true);
                expect(br.exec.args[0][0]).to.equal('CAPABILITY');

                br.exec.restore();
            });
        });

        describe('#listNamespaces', function() {
            it('should run NAMESPACE if supported', function() {
                sinon.stub(br, 'exec');

                br.capability = ['NAMESPACE'];
                br.listNamespaces();
                expect(br.exec.callCount).to.equal(1);
                expect(br.exec.args[0][0]).to.equal('NAMESPACE');
                expect(br.exec.args[0][1]).to.equal('NAMESPACE');

                br.exec.restore();
            });

            it('should do nothing if not supported', function() {
                sinon.stub(br, 'exec');

                br.capability = [];
                br.listNamespaces(function() {});
                expect(br.exec.callCount).to.equal(0);

                br.exec.restore();
            });
        });

        describe('#login', function() {
            it('should call LOGIN', function() {
                sinon.stub(br, 'exec');

                br.login({
                    user: 'u1',
                    pass: 'p1'
                });

                expect(br.exec.callCount).to.equal(1);
                expect(br.exec.args[0][0]).to.deep.equal({
                    command: 'login',
                    attributes: [{
                        type: 'STRING',
                        value: 'u1'
                    }, {
                        type: 'STRING',
                        value: 'p1'
                    }]
                });

                br.exec.restore();
            });

            it('should call XOAUTH2', function() {
                sinon.stub(br, 'exec');

                br.capability = ['AUTH=XOAUTH2'];
                br.login({
                    user: 'u1',
                    xoauth2: 'abc'
                });

                expect(br.exec.callCount).to.equal(1);
                expect(br.exec.args[0][0]).to.deep.equal({
                    command: 'AUTHENTICATE',
                    attributes: [{
                        type: 'ATOM',
                        value: 'XOAUTH2'
                    }, {
                        type: 'ATOM',
                        value: 'dXNlcj11MQFhdXRoPUJlYXJlciBhYmMBAQ=='
                    }]
                });

                br.exec.restore();
            });
        });

        describe('#updateId', function() {
            it('should not nothing if not supported', function() {
                br.capability = [];
                br.updateId({
                    a: 'b',
                    c: 'd'
                }, function(err, id) {
                    expect(err).to.not.exist;
                    expect(id).to.be.false;
                });
            });

            it('should send NIL', function(done) {
                sinon.stub(br, 'exec', function(command, untagged, callback) {
                    expect(command).to.deep.equal({
                        command: 'ID',
                        attributes: [
                            null
                        ]
                    });

                    callback(null, {
                        payload: {
                            ID: [{
                                attributes: [
                                    null
                                ]
                            }]
                        }
                    }, function() {
                        br.exec.restore();
                        done();
                    });
                });

                br.capability = ['ID'];
                br.updateId(null, function(err, id) {
                    expect(err).to.not.exist;
                    expect(id).to.deep.equal({});
                });
            });

            it('should exhange ID values', function(done) {
                sinon.stub(br, 'exec', function(command, untagged, callback) {
                    expect(command).to.deep.equal({
                        command: 'ID',
                        attributes: [
                            ['ckey1', 'cval1', 'ckey2', 'cval2']
                        ]
                    });

                    callback(null, {
                        payload: {
                            ID: [{
                                attributes: [
                                    [{
                                        value: 'skey1'
                                    }, {
                                        value: 'sval1'
                                    }, {
                                        value: 'skey2'
                                    }, {
                                        value: 'sval2'
                                    }]
                                ]
                            }]
                        }
                    }, function() {
                        br.exec.restore();
                        done();
                    });
                });

                br.capability = ['ID'];
                br.updateId({
                    ckey1: 'cval1',
                    ckey2: 'cval2'
                }, function(err, id) {
                    expect(err).to.not.exist;
                    expect(id).to.deep.equal({
                        skey1: 'sval1',
                        skey2: 'sval2'
                    });
                });
            });
        });

        describe('#listMailboxes', function() {
            it('should call LIST and LSUB in sequence', function(done) {
                sinon.stub(br, 'exec', function(command, untagged, callback) {
                    br.exec.restore();
                    sinon.stub(br, 'exec', function(command, untagged, callback) {
                        br.exec.restore();

                        expect(command).to.deep.equal({
                            command: 'LSUB',
                            attributes: ['', '*']
                        });
                        callback(null, {
                            payload: {
                                LSUB: [false]
                            }
                        }, function() {
                            done();
                        });
                    });

                    expect(command).to.deep.equal({
                        command: 'LIST',
                        attributes: ['', '*']
                    });
                    callback(null, {
                        payload: {
                            LIST: [false]
                        }
                    }, function() {});
                });

                br.listMailboxes(function(err, tree) {
                    expect(err).to.not.exist;
                    expect(tree).to.exist;
                });
            });
        });

        describe('#listMessages', function() {
            it('should call FETCH', function(done) {
                sinon.stub(br, 'exec', function(command, untagged, callback) {
                    callback(null, 'abc', done);
                });
                sinon.stub(br, '_buildFETCHCommand', function() {
                    return {};
                });
                sinon.stub(br, '_parseFETCH');

                br.listMessages('1:2', ['uid', 'flags'], {
                    byUid: true
                }, function() {});

                expect(br._buildFETCHCommand.callCount).to.equal(1);
                expect(br._buildFETCHCommand.args[0][0]).to.equal('1:2');
                expect(br._buildFETCHCommand.args[0][1]).to.deep.equal(['uid', 'flags']);
                expect(br._buildFETCHCommand.args[0][2]).to.deep.equal({
                    byUid: true
                });
                expect(br.exec.callCount).to.equal(1);
                expect(br._parseFETCH.withArgs('abc').callCount).to.equal(1);

                br.exec.restore();
                br._buildFETCHCommand.restore();
                br._parseFETCH.restore();
            });
        });

        describe('#search', function() {
            it('should call SEARCH', function(done) {
                sinon.stub(br, 'exec', function(command, untagged, callback) {
                    callback(null, 'abc', done);
                });
                sinon.stub(br, '_buildSEARCHCommand', function() {
                    return {};
                });
                sinon.stub(br, '_parseSEARCH');

                br.search({
                    uid: 1
                }, {
                    byUid: true
                }, function() {});

                expect(br._buildSEARCHCommand.callCount).to.equal(1);
                expect(br._buildSEARCHCommand.args[0][0]).to.deep.equal({
                    uid: 1
                });
                expect(br._buildSEARCHCommand.args[0][1]).to.deep.equal({
                    byUid: true
                });
                expect(br.exec.callCount).to.equal(1);
                expect(br._parseSEARCH.withArgs('abc').callCount).to.equal(1);

                br.exec.restore();
                br._buildSEARCHCommand.restore();
                br._parseSEARCH.restore();
            });
        });

        describe('#setFlags', function() {
            it('should call STORE', function(done) {
                sinon.stub(br, 'exec', function(command, untagged, callback) {
                    callback(null, 'abc', done);
                });
                sinon.stub(br, '_buildSTORECommand', function() {
                    return {};
                });
                sinon.stub(br, '_parseFETCH');

                br.setFlags('1:2', ['\\Seen', '$MyFlag'], {
                    byUid: true
                }, function() {});

                expect(br._buildSTORECommand.callCount).to.equal(1);
                expect(br._buildSTORECommand.args[0][0]).to.equal('1:2');
                expect(br._buildSTORECommand.args[0][1]).to.deep.equal(['\\Seen', '$MyFlag']);
                expect(br._buildSTORECommand.args[0][2]).to.deep.equal({
                    byUid: true
                });
                expect(br.exec.callCount).to.equal(1);
                expect(br._parseFETCH.withArgs('abc').callCount).to.equal(1);

                br.exec.restore();
                br._buildSTORECommand.restore();
                br._parseFETCH.restore();
            });
        });

        describe('#deleteMessages', function() {
            beforeEach(function() {
                sinon.stub(br, 'setFlags', function(seq, flags, options, callback) {
                    expect(flags).to.deep.equal({
                        add: '\\Deleted'
                    });
                    callback();
                });
                sinon.stub(br, 'exec', function(command, callback) {
                    callback(null, 'abc', function() {});
                });
            });

            afterEach(function() {
                br.setFlags.restore();
                br.exec.restore();
            });

            it('should call UID EXPUNGE', function() {
                br.capability = ['UIDPLUS'];
                br.deleteMessages('1:2', {
                    byUid: true
                }, function() {});

                expect(br.exec.callCount).to.equal(1);
                expect(br.exec.args[0][0]).to.deep.equal({
                    command: 'UID EXPUNGE',
                    attributes: [{
                        type: 'sequence',
                        value: '1:2'
                    }]
                });
            });

            it('should call EXPUNGE', function() {
                br.capability = [];
                br.deleteMessages('1:2', {
                    byUid: true
                }, function() {});

                expect(br.exec.callCount).to.equal(1);
                expect(br.exec.args[0][0]).to.equal('EXPUNGE');
            });
        });

        describe('#copyMessages', function() {
            it('should call COPY', function(done) {
                sinon.stub(br, 'exec', function(command, callback) {
                    callback(null, {
                        humanReadable: 'abc'
                    }, done);
                });

                br.copyMessages('1:2', '[Gmail]/Trash', {
                    byUid: true
                }, function(err, response) {
                    expect(err).to.not.exist;
                    expect(response).to.equal('abc');
                });

                expect(br.exec.callCount).to.equal(1);
                expect(br.exec.args[0][0]).to.deep.equal({
                    command: 'UID COPY',
                    attributes: [{
                        type: 'sequence',
                        value: '1:2'
                    }, {
                        type: 'atom',
                        value: '[Gmail]/Trash'
                    }]
                });

                br.exec.restore();
            });
        });

        describe('#moveMessages', function() {
            it('should call MOVE if supported', function(done) {
                sinon.stub(br, 'exec', function(command, untagged, callback) {
                    callback(null, 'abc', done);
                });

                br.capability = ['MOVE'];
                br.moveMessages('1:2', '[Gmail]/Trash', {
                    byUid: true
                }, function() {});

                expect(br.exec.callCount).to.equal(1);
                expect(br.exec.args[0][0]).to.deep.equal({
                    command: 'UID MOVE',
                    attributes: [{
                        type: 'sequence',
                        value: '1:2'
                    }, {
                        type: 'atom',
                        value: '[Gmail]/Trash'
                    }]
                });
                expect(br.exec.args[0][1]).to.deep.equal(['OK']);

                br.exec.restore();
            });

            it('should fallback to copy+expunge', function() {
                sinon.stub(br, 'copyMessages', function(sequence, destination, options, callback) {
                    expect(sequence).to.equal('1:2');
                    expect(destination).to.equal('[Gmail]/Trash');
                    expect(options).to.deep.equal({
                        byUid: true
                    });
                    callback();
                });
                sinon.stub(br, 'deleteMessages');

                br.capability = [];
                br.moveMessages('1:2', '[Gmail]/Trash', {
                    byUid: true
                }, function() {});

                expect(br.deleteMessages.callCount).to.equal(1);
                expect(br.deleteMessages.args[0][0]).to.equal('1:2');
                expect(br.deleteMessages.args[0][1]).to.deep.equal({
                    byUid: true
                });

                br.copyMessages.restore();
                br.deleteMessages.restore();
            });
        });

        describe('#selectMailbox', function() {
            it('should run SELECT', function(done) {
                sinon.stub(br, 'exec', function(command, untagged, callback) {
                    callback(null, 'abc', done);
                });
                sinon.stub(br, '_parseSELECT');

                br.selectMailbox('[Gmail]/Trash', function() {});

                expect(br.exec.callCount).to.equal(1);
                expect(br.exec.args[0][0]).to.deep.equal({
                    command: 'SELECT',
                    attributes: [{
                        type: 'STRING',
                        value: '[Gmail]/Trash'
                    }]
                });
                expect(br._parseSELECT.withArgs('abc').callCount).to.equal(1);
                expect(br.state).to.equal(br.STATE_SELECTED);

                br.exec.restore();
                br._parseSELECT.restore();
            });

            it('should run SELECT with CONDSTORE', function(done) {
                sinon.stub(br, 'exec', function(command, untagged, callback) {
                    callback(null, 'abc', done);
                });
                sinon.stub(br, '_parseSELECT');

                br.capability = ['CONDSTORE'];
                br.selectMailbox('[Gmail]/Trash', {
                    condstore: true
                }, function() {});

                expect(br.exec.callCount).to.equal(1);
                expect(br.exec.args[0][0]).to.deep.equal({
                    command: 'SELECT',
                    attributes: [{
                            type: 'STRING',
                            value: '[Gmail]/Trash'
                        },
                        [{
                            type: 'ATOM',
                            value: 'CONDSTORE'
                        }]
                    ]
                });
                expect(br._parseSELECT.withArgs('abc').callCount).to.equal(1);
                expect(br.state).to.equal(br.STATE_SELECTED);

                br.exec.restore();
                br._parseSELECT.restore();
            });

            it('should emit onselectmailbox', function(done) {
                sinon.stub(br, 'exec', function(command, untagged, callback) {
                    callback(null, 'abc', done);
                });
                sinon.stub(br, '_parseSELECT').returns('def');
                sinon.stub(br, 'onselectmailbox');

                br.selectMailbox('[Gmail]/Trash', function() {});

                expect(br._parseSELECT.withArgs('abc').callCount).to.equal(1);
                expect(br.onselectmailbox.withArgs('[Gmail]/Trash', 'def').callCount).to.equal(1);

                br.exec.restore();
                br._parseSELECT.restore();
                br.onselectmailbox.restore();
            });

            it('should emit onclosemailbox', function(done) {
                sinon.stub(br, 'exec', function(command, untagged, callback) {
                    callback(null, 'abc', done);
                });
                sinon.stub(br, '_parseSELECT').returns('def');
                sinon.stub(br, 'onclosemailbox');

                br.selectedMailbox = 'yyy';
                br.selectMailbox('[Gmail]/Trash', function() {});

                expect(br.onclosemailbox.withArgs('yyy').callCount).to.equal(1);

                br.exec.restore();
                br._parseSELECT.restore();
                br.onclosemailbox.restore();
            });
        });

        describe('#hasCapability', function() {
            it('should detect existing capability', function() {
                br.capability = ['ZZZ'];
                expect(br.hasCapability('zzz')).to.be.true;
            });

            it('should detect non existing capability', function() {
                br.capability = ['ZZZ'];
                expect(br.hasCapability('ooo')).to.be.false;
                expect(br.hasCapability()).to.be.false;
            });
        });

        describe('#_untaggedOkHandler', function() {
            it('should update capability if present', function() {
                br._untaggedOkHandler({
                    capability: ['abc']
                }, function() {});
                expect(br.capability).to.deep.equal(['abc']);
            });
        });

        describe('#_untaggedCapabilityHandler', function() {
            it('should update capability', function() {
                br._untaggedCapabilityHandler({
                    attributes: [{
                        value: 'abc'
                    }]
                }, function() {});
                expect(br.capability).to.deep.equal(['ABC']);
            });
        });

        describe('#_untaggedExistsHandler', function() {
            it('should emit onupdate', function() {
                sinon.stub(br, 'onupdate');

                br._untaggedExistsHandler({
                    nr: 123
                }, function() {});
                expect(br.onupdate.withArgs('exists', 123).callCount).to.equal(1);

                br.onupdate.restore();
            });
        });

        describe('#_untaggedExpungeHandler', function() {
            it('should emit onupdate', function() {
                sinon.stub(br, 'onupdate');

                br._untaggedExpungeHandler({
                    nr: 123
                }, function() {});
                expect(br.onupdate.withArgs('expunge', 123).callCount).to.equal(1);

                br.onupdate.restore();
            });
        });

        describe('#_untaggedFetchHandler', function() {
            it('should emit onupdate', function() {
                sinon.stub(br, 'onupdate');
                sinon.stub(br, '_parseFETCH').returns('abc');

                br._untaggedFetchHandler({
                    nr: 123
                }, function() {});
                expect(br.onupdate.withArgs('fetch', 'abc').callCount).to.equal(1);
                expect(br._parseFETCH.args[0][0]).to.deep.equal({
                    payload: {
                        FETCH: [{
                            nr: 123
                        }]
                    }
                });

                br.onupdate.restore();
                br._parseFETCH.restore();
            });
        });

        describe('#_parseSELECT', function() {
            it('should parse a complete response', function() {
                expect(br._parseSELECT({
                    code: 'READ-WRITE',
                    payload: {
                        EXISTS: [{
                            nr: 123
                        }],
                        FLAGS: [{
                            attributes: [
                                [{
                                    type: 'ATOM',
                                    value: '\\Answered'
                                }, {
                                    type: 'ATOM',
                                    value: '\\Flagged'
                                }]
                            ]
                        }],
                        OK: [{
                            code: 'PERMANENTFLAGS',
                            permanentflags: ['\\Answered', '\\Flagged']
                        }, {
                            code: 'UIDVALIDITY',
                            uidvalidity: '2'
                        }, {
                            code: 'UIDNEXT',
                            uidnext: '38361'
                        }, {
                            code: 'HIGHESTMODSEQ',
                            highestmodseq: '3682918'
                        }]
                    }
                })).to.deep.equal({
                    exists: 123,
                    flags: ['\\Answered', '\\Flagged'],
                    highestModseq: 3682918,
                    permanentFlags: ['\\Answered', '\\Flagged'],
                    readOnly: false,
                    uidNext: 38361,
                    uidValidity: 2
                });
            });

            it('should parse response with ne modseq', function() {
                expect(br._parseSELECT({
                    code: 'READ-WRITE',
                    payload: {
                        EXISTS: [{
                            nr: 123
                        }],
                        FLAGS: [{
                            attributes: [
                                [{
                                    type: 'ATOM',
                                    value: '\\Answered'
                                }, {
                                    type: 'ATOM',
                                    value: '\\Flagged'
                                }]
                            ]
                        }],
                        OK: [{
                            code: 'PERMANENTFLAGS',
                            permanentflags: ['\\Answered', '\\Flagged']
                        }, {
                            code: 'UIDVALIDITY',
                            uidvalidity: '2'
                        }, {
                            code: 'UIDNEXT',
                            uidnext: '38361'
                        }]
                    }
                })).to.deep.equal({
                    exists: 123,
                    flags: ['\\Answered', '\\Flagged'],
                    permanentFlags: ['\\Answered', '\\Flagged'],
                    readOnly: false,
                    uidNext: 38361,
                    uidValidity: 2
                });
            });

            it('should parse response with read-only', function() {
                expect(br._parseSELECT({
                    code: 'READ-ONLY',
                    payload: {
                        EXISTS: [{
                            nr: 123
                        }],
                        FLAGS: [{
                            attributes: [
                                [{
                                    type: 'ATOM',
                                    value: '\\Answered'
                                }, {
                                    type: 'ATOM',
                                    value: '\\Flagged'
                                }]
                            ]
                        }],
                        OK: [{
                            code: 'PERMANENTFLAGS',
                            permanentflags: ['\\Answered', '\\Flagged']
                        }, {
                            code: 'UIDVALIDITY',
                            uidvalidity: '2'
                        }, {
                            code: 'UIDNEXT',
                            uidnext: '38361'
                        }]
                    }
                })).to.deep.equal({
                    exists: 123,
                    flags: ['\\Answered', '\\Flagged'],
                    permanentFlags: ['\\Answered', '\\Flagged'],
                    readOnly: true,
                    uidNext: 38361,
                    uidValidity: 2
                });
            });
        });

        describe('#_parseNAMESPACE', function() {
            it('should not succeed for no namespace response', function() {
                expect(br._parseNAMESPACE({
                    payload: {
                        NAMESPACE: []
                    }
                })).to.be.false;
            });

            it('should return single personal namespace', function() {
                expect(br._parseNAMESPACE({
                    payload: {
                        NAMESPACE: [{
                            attributes: [
                                [
                                    [{
                                        type: 'STRING',
                                        value: 'INBOX.'
                                    }, {
                                        type: 'STRING',
                                        value: '.'
                                    }]
                                ], null, null
                            ]
                        }]
                    }
                })).to.deep.equal({
                    personal: [{
                        prefix: 'INBOX.',
                        delimiter: '.'
                    }],
                    users: false,
                    shared: false
                });
            });

            it('should return single personal, single users, multiple shared', function() {
                expect(br._parseNAMESPACE({
                    payload: {
                        NAMESPACE: [{
                            attributes: [
                                // personal
                                [
                                    [{
                                        type: 'STRING',
                                        value: ''
                                    }, {
                                        type: 'STRING',
                                        value: '/'
                                    }]
                                ],
                                // users
                                [
                                    [{
                                        type: 'STRING',
                                        value: '~'
                                    }, {
                                        type: 'STRING',
                                        value: '/'
                                    }]
                                ],
                                // shared
                                [
                                    [{
                                        type: 'STRING',
                                        value: '#shared/'
                                    }, {
                                        type: 'STRING',
                                        value: '/'
                                    }],
                                    [{
                                        type: 'STRING',
                                        value: '#public/'
                                    }, {
                                        type: 'STRING',
                                        value: '/'
                                    }]
                                ]
                            ]
                        }]
                    }
                })).to.deep.equal({
                    personal: [{
                        prefix: '',
                        delimiter: '/'
                    }],
                    users: [{
                        prefix: '~',
                        delimiter: '/'
                    }],
                    shared: [{
                        prefix: '#shared/',
                        delimiter: '/'
                    }, {
                        prefix: '#public/',
                        delimiter: '/'
                    }]
                });

            });
        });

        describe('#_buildFETCHCommand', function() {
            it('should build single ALL', function() {
                expect(br._buildFETCHCommand('1:*', 'all', {})).to.deep.equal({
                    command: 'FETCH',
                    attributes: [{
                        type: 'SEQUENCE',
                        value: '1:*'
                    }, {
                        type: 'ATOM',
                        value: 'ALL'
                    }]
                });
            });

            it('should build FETCH with uid', function() {
                expect(br._buildFETCHCommand('1:*', 'all', {
                    byUid: true
                })).to.deep.equal({
                    command: 'UID FETCH',
                    attributes: [{
                        type: 'SEQUENCE',
                        value: '1:*'
                    }, {
                        type: 'ATOM',
                        value: 'ALL'
                    }]
                });
            });

            it('should build FETCH with uid, envelope', function() {
                expect(br._buildFETCHCommand('1:*', ['uid', 'envelope'], {})).to.deep.equal({
                    command: 'FETCH',
                    attributes: [{
                            type: 'SEQUENCE',
                            value: '1:*'
                        },
                        [{
                            type: 'ATOM',
                            value: 'UID'
                        }, {
                            type: 'ATOM',
                            value: 'ENVELOPE'
                        }]
                    ]
                });
            });

            it('should build FETCH with modseq', function() {
                expect(br._buildFETCHCommand('1:*', ['modseq (1234567)'], {})).to.deep.equal({
                    command: 'FETCH',
                    attributes: [{
                            type: 'SEQUENCE',
                            value: '1:*'
                        },
                        [{
                                type: 'ATOM',
                                value: 'MODSEQ'
                            },
                            [{
                                type: 'ATOM',
                                value: '1234567'
                            }]
                        ]
                    ]
                });
            });

            it('should build FETCH with section', function() {
                expect(br._buildFETCHCommand('1:*', 'body[text]', {})).to.deep.equal({
                    command: 'FETCH',
                    attributes: [{
                        type: 'SEQUENCE',
                        value: '1:*'
                    }, {
                        type: 'ATOM',
                        value: 'BODY',
                        section: [{
                            type: 'ATOM',
                            value: 'TEXT'
                        }]
                    }]
                });
            });

            it('should build FETCH with section and list', function() {
                expect(br._buildFETCHCommand('1:*', 'body[header.fields (date in-reply-to)]', {})).to.deep.equal({
                    command: 'FETCH',
                    attributes: [{
                        type: 'SEQUENCE',
                        value: '1:*'
                    }, {
                        type: 'ATOM',
                        value: 'BODY',
                        section: [{
                                type: 'ATOM',
                                value: 'HEADER.FIELDS'
                            },
                            [{
                                type: 'ATOM',
                                value: 'DATE'
                            }, {
                                type: 'ATOM',
                                value: 'IN-REPLY-TO'
                            }]
                        ]
                    }]
                });
            });

            it('should build FETCH with ', function() {
                expect(br._buildFETCHCommand('1:*', 'all', {
                    changedSince: 123456
                })).to.deep.equal({
                    command: 'FETCH',
                    attributes: [{
                            type: 'SEQUENCE',
                            value: '1:*'
                        }, {
                            type: 'ATOM',
                            value: 'ALL'
                        },
                        [{
                                type: 'ATOM',
                                value: 'CHANGEDSINCE'
                            },
                            123456
                        ]
                    ]
                });
            });

            it('should build FETCH with partial', function() {
                expect(br._buildFETCHCommand('1:*', 'body[]', {})).to.deep.equal({
                    command: 'FETCH',
                    attributes: [{
                        type: 'SEQUENCE',
                        value: '1:*'
                    }, {
                        type: 'ATOM',
                        value: 'BODY',
                        section: []
                    }]
                });
            });
        });

        describe('#_parseFETCH', function() {
            it('should return values lowercase keys', function() {
                sinon.stub(br, '_parseFetchValue').returns('def');
                expect(br._parseFETCH({
                    payload: {
                        FETCH: [{
                            nr: 123,
                            attributes: [
                                [{
                                    type: 'ATOM',
                                    value: 'BODY',
                                    section: [{
                                            type: 'ATOM',
                                            value: 'HEADER'
                                        },
                                        [{
                                            type: 'ATOM',
                                            value: 'DATE'
                                        }, {
                                            type: 'ATOM',
                                            value: 'SUBJECT'
                                        }]
                                    ],
                                    partial: [0, 123]
                                }, {
                                    type: 'ATOM',
                                    value: 'abc'
                                }]
                            ]
                        }]
                    }
                })).to.deep.equal([{
                    '#': 123,
                    'body[header (date subject)]<0.123>': 'def'
                }]);

                expect(br._parseFetchValue.withArgs('body[header (date subject)]<0.123>', {
                    type: 'ATOM',
                    value: 'abc'
                }).callCount).to.equal(1);

                br._parseFetchValue.restore();
            });
        });

        describe('#_parseENVELOPE', function() {
            it('should parsed envelope object', function() {
                expect(br._parseENVELOPE(testEnvelope.source)).to.deep.equal(testEnvelope.parsed);
            });
        });

        describe('#_parseBODYSTRUCTURE', function() {
            it('should parse bodystructure object', function() {
                expect(br._parseBODYSTRUCTURE(mimeTorture.source)).to.deep.equal(mimeTorture.parsed);
            });
        });

        describe('#_buildSEARCHCommand', function() {
            it('should compose a search command', function() {
                expect(br._buildSEARCHCommand({
                    unseen: true,
                    header: ['subject', 'hello world'],
                    or: {
                        unseen: true,
                        seen: true
                    },
                    not: {
                        seen: true
                    },
                    sentbefore: new Date(2011, 1, 3, 12, 0, 0),
                    since: new Date(2011, 11, 23, 12, 0, 0),
                    uid: '1:*'
                }, {})).to.deep.equal({
                    command: 'SEARCH',
                    attributes: [{
                        'type': 'atom',
                        'value': 'UNSEEN'
                    }, {
                        'type': 'atom',
                        'value': 'HEADER'
                    }, {
                        'type': 'string',
                        'value': 'subject'
                    }, {
                        'type': 'string',
                        'value': 'hello world'
                    }, {
                        'type': 'atom',
                        'value': 'OR'
                    }, {
                        'type': 'atom',
                        'value': 'UNSEEN'
                    }, {
                        'type': 'atom',
                        'value': 'SEEN'
                    }, {
                        'type': 'atom',
                        'value': 'NOT'
                    }, {
                        'type': 'atom',
                        'value': 'SEEN'
                    }, {
                        'type': 'atom',
                        'value': 'SENTBEFORE'
                    }, {
                        'type': 'string',
                        'value': '3-Feb-2011'
                    }, {
                        'type': 'atom',
                        'value': 'SINCE'
                    }, {
                        'type': 'string',
                        'value': '23-Dec-2011'
                    }, {
                        'type': 'atom',
                        'value': 'UID'
                    }, {
                        'type': 'sequence',
                        'value': '1:*'
                    }]
                });
            });
        });

        describe('#_parseSEARCH', function() {
            it('should parse SEARCH response', function() {
                expect(br._parseSEARCH({
                    payload: {
                        SEARCH: [{
                            attributes: [{
                                value: 5
                            }, {
                                value: 7
                            }]
                        }, {
                            attributes: [{
                                value: 6
                            }]
                        }]
                    }
                })).to.deep.equal([5, 6, 7]);
            });

            it('should parse empty SEARCH response', function() {
                expect(br._parseSEARCH({
                    payload: {
                        SEARCH: [{
                            command: 'SEARCH',
                            tag: '*'
                        }]
                    }
                })).to.deep.equal([]);
            });
        });

        describe('#_buildSTORECommand', function() {
            it('should compose a store command from a string', function() {
                expect(br._buildSTORECommand('1,2,3', 'a', {})).to.deep.equal({
                    command: 'STORE',
                    attributes: [{
                            'type': 'sequence',
                            'value': '1,2,3'
                        }, {
                            'type': 'atom',
                            'value': 'FLAGS'
                        },
                        [{
                            'type': 'atom',
                            'value': 'a'
                        }]
                    ]
                });
            });

            it('should compose a store command from an array', function() {
                expect(br._buildSTORECommand('1,2,3', ['a', 'b'], {})).to.deep.equal({
                    command: 'STORE',
                    attributes: [{
                            'type': 'sequence',
                            'value': '1,2,3'
                        }, {
                            'type': 'atom',
                            'value': 'FLAGS'
                        },
                        [{
                            'type': 'atom',
                            'value': 'a'
                        }, {
                            'type': 'atom',
                            'value': 'b'
                        }]
                    ]
                });
            });

            it('should compose a store set flags command', function() {
                expect(br._buildSTORECommand('1,2,3', {
                    set: ['a', 'b']
                }, {})).to.deep.equal({
                    command: 'STORE',
                    attributes: [{
                            'type': 'sequence',
                            'value': '1,2,3'
                        }, {
                            'type': 'atom',
                            'value': 'FLAGS'
                        },
                        [{
                            'type': 'atom',
                            'value': 'a'
                        }, {
                            'type': 'atom',
                            'value': 'b'
                        }]
                    ]
                });
            });

            it('should compose a store add flags command', function() {
                expect(br._buildSTORECommand('1,2,3', {
                    add: ['a', 'b']
                }, {})).to.deep.equal({
                    command: 'STORE',
                    attributes: [{
                            'type': 'sequence',
                            'value': '1,2,3'
                        }, {
                            'type': 'atom',
                            'value': '+FLAGS'
                        },
                        [{
                            'type': 'atom',
                            'value': 'a'
                        }, {
                            'type': 'atom',
                            'value': 'b'
                        }]
                    ]
                });
            });

            it('should compose a store remove flags command', function() {
                expect(br._buildSTORECommand('1,2,3', {
                    remove: ['a', 'b']
                }, {})).to.deep.equal({
                    command: 'STORE',
                    attributes: [{
                            'type': 'sequence',
                            'value': '1,2,3'
                        }, {
                            'type': 'atom',
                            'value': '-FLAGS'
                        },
                        [{
                            'type': 'atom',
                            'value': 'a'
                        }, {
                            'type': 'atom',
                            'value': 'b'
                        }]
                    ]
                });
            });

            it('should compose a store remove silent flags command', function() {
                expect(br._buildSTORECommand('1,2,3', {
                    remove: ['a', 'b']
                }, {
                    silent: true
                })).to.deep.equal({
                    command: 'STORE',
                    attributes: [{
                            'type': 'sequence',
                            'value': '1,2,3'
                        }, {
                            'type': 'atom',
                            'value': '-FLAGS.SILENT'
                        },
                        [{
                            'type': 'atom',
                            'value': 'a'
                        }, {
                            'type': 'atom',
                            'value': 'b'
                        }]
                    ]
                });
            });

            it('should compose a uid store flags command', function() {
                expect(br._buildSTORECommand('1,2,3', {
                    set: ['a', 'b']
                }, {
                    byUid: true
                })).to.deep.equal({
                    command: 'UID STORE',
                    attributes: [{
                            'type': 'sequence',
                            'value': '1,2,3'
                        }, {
                            'type': 'atom',
                            'value': 'FLAGS'
                        },
                        [{
                            'type': 'atom',
                            'value': 'a'
                        }, {
                            'type': 'atom',
                            'value': 'b'
                        }]
                    ]
                });
            });

        });

        describe('#_changeState', function() {
            it('should set the state value', function() {
                br._changeState(12345);

                expect(br.state).to.equal(12345);
            });

            it('should emit onclosemailbox if mailbox was closed', function() {
                sinon.stub(br, 'onclosemailbox');
                br.state = br.STATE_SELECTED;
                br.selectedMailbox = 'aaa';

                br._changeState(12345);

                expect(br.selectedMailbox).to.be.false;
                expect(br.onclosemailbox.withArgs('aaa').callCount).to.equal(1);
                br.onclosemailbox.restore();
            });
        });

        describe('#_ensurePath', function() {
            it('should create the path if not present', function() {
                var tree = {
                    children: []
                };
                expect(br._ensurePath(tree, 'hello/world', '/')).to.deep.equal({
                    name: 'world',
                    delimiter: '/',
                    path: 'hello/world',
                    children: []
                });
                expect(tree).to.deep.equal({
                    children: [{
                        name: 'hello',
                        delimiter: '/',
                        path: 'hello',
                        children: [{
                            name: 'world',
                            delimiter: '/',
                            path: 'hello/world',
                            children: []
                        }]
                    }]
                });
            });

            it('should return existing path if possible', function() {
                var tree = {
                    children: [{
                        name: 'hello',
                        delimiter: '/',
                        path: 'hello',
                        children: [{
                            name: 'world',
                            delimiter: '/',
                            path: 'hello/world',
                            children: [],
                            abc: 123
                        }]
                    }]
                };
                expect(br._ensurePath(tree, 'hello/world', '/')).to.deep.equal({
                    name: 'world',
                    delimiter: '/',
                    path: 'hello/world',
                    children: [],
                    abc: 123
                });
            });
        });

        describe('#_checkSpecialUse', function() {
            it('should exist', function() {
                br.capability = ['SPECIAL-USE'];

                expect(br._checkSpecialUse({
                    flags: ['test', '\\All']
                })).to.equal('\\All');

            });

            it('should fail for non-existent flag', function() {
                br.capability = ['SPECIAL-USE'];

                expect(false, br._checkSpecialUse({}));
            });

            it('should fail for invalid flag', function() {
                br.capability = ['SPECIAL-USE'];

                expect(br._checkSpecialUse({
                    flags: ['test']
                })).to.be.false;
            });

            it('should fail when no extension is present', function() {
                expect(br._checkSpecialUse({
                    name: 'test'
                })).to.be.false;
                expect(br._checkSpecialUse({
                    name: 'Praht'
                })).to.equal('\\Trash');
            });
        });

        describe('#_specialUseType', function() {
            it('should return special use flag if match is found', function() {
                expect(br._specialUseType('praht')).to.equal('\\Trash');
                expect(br._specialUseType('aaaa')).to.be.false;
            });
        });

        describe('#_buildXOAuth2Token', function() {
            it('should return base64 encoded XOAUTH2 token', function() {
                expect(br._buildXOAuth2Token('user@host', 'abcde')).to.equal('dXNlcj11c2VyQGhvc3QBYXV0aD1CZWFyZXIgYWJjZGUBAQ==');
            });
        });

        describe('untagged updates', function() {
            it('should receive information about untagged exists', function(done) {
                br.client._connectionReady = true;
                br.onupdate = function(type, value) {
                    expect(type).to.equal('exists');
                    expect(value).to.equal(123);
                    done();
                };
                br.client._addToServerQueue('* 123 EXISTS');
            });

            it('should receive information about untagged expunge', function(done) {
                br.client._connectionReady = true;
                br.onupdate = function(type, value) {
                    expect(type).to.equal('expunge');
                    expect(value).to.equal(456);
                    done();
                };
                br.client._addToServerQueue('* 456 EXPUNGE');
            });

            it('should receive information about untagged fetch', function(done) {
                br.client._connectionReady = true;
                br.onupdate = function(type, value) {
                    expect(type).to.equal('fetch');
                    expect(value).to.deep.equal({
                        '#': 123,
                        'flags': ['\\Seen'],
                        'modseq': 4
                    });
                    done();
                };
                br.client._addToServerQueue('* 123 FETCH (FLAGS (\\Seen) MODSEQ (4))');
            });
        });
    });
});